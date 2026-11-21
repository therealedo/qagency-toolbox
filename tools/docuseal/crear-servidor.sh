#!/bin/bash
# Q Agency Toolbox: crea el servidor de firmas (DocuSeal) en Google Cloud.
# Se corre UNA vez en Cloud Shell (la terminal dentro de la consola de
# Google Cloud), con el proyecto ya elegido y la facturacion activa:
#   bash crear-servidor.sh
# Crea: IP fija, cortafuegos (solo 80/443; SSH solo por IAP), la maquina
# e2-micro con Ubuntu 24.04, copias diarias del disco (14 dias) y una
# alerta de presupuesto de 20 USD. No toca datos de clientes.
set -euo pipefail

DOCUSEAL_VERSION="3.3.7"
CADDY_VERSION="2.11.9"
REGION="us-central1"
ZONE="us-central1-a"
NAME="docuseal"

PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [ -z "$PROJECT" ]; then
  echo "No hay proyecto elegido. Elija uno arriba en la consola y vuelva a correr el script."
  exit 1
fi
if [ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')" != "True" ]; then
  echo "El proyecto $PROJECT no tiene la facturacion activa. Activela y vuelva a correr el script."
  exit 1
fi
echo "Proyecto: $PROJECT"

gcloud services enable compute.googleapis.com billingbudgets.googleapis.com

# IP fija
if ! gcloud compute addresses describe "$NAME-ip" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$NAME-ip" --region="$REGION"
fi
IP="$(gcloud compute addresses describe "$NAME-ip" --region="$REGION" --format='value(address)')"
HOST="${IP//./-}.sslip.io"
echo "Direccion del servidor: https://$HOST"

# Cortafuegos: web abierta; SSH solo desde el servicio IAP de Google.
if ! gcloud compute firewall-rules describe "$NAME-web" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$NAME-web" --network=default \
    --allow=tcp:80,tcp:443,udp:443 --source-ranges=0.0.0.0/0 --target-tags="$NAME"
fi
if ! gcloud compute firewall-rules describe "$NAME-ssh-iap" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$NAME-ssh-iap" --network=default \
    --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags="$NAME"
fi
for rule in default-allow-ssh default-allow-rdp; do
  if gcloud compute firewall-rules describe "$rule" >/dev/null 2>&1; then
    gcloud compute firewall-rules update "$rule" --disabled
  fi
done

# Script que corre la maquina en cada arranque.
STARTUP="$(mktemp)"
cat > "$STARTUP" <<'INICIO'
#!/bin/bash
set -euo pipefail
md() { curl -fs -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
if [ ! -f /srv/docuseal/.instalado ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  swapon -a || true
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl unattended-upgrades
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  mkdir -p /srv/docuseal
  touch /srv/docuseal/.instalado
fi
cd /srv/docuseal
cat > .env <<EOF
HOST=$(md docuseal-host)
DOCUSEAL_VERSION=$(md docuseal-version)
CADDY_VERSION=$(md caddy-version)
EOF
cat > docker-compose.yml <<'EOF'
services:
  app:
    image: docuseal/docuseal:${DOCUSEAL_VERSION}
    restart: unless-stopped
    volumes:
      - ./data:/data/docuseal
    environment:
      - FORCE_SSL=${HOST}
  caddy:
    image: caddy:${CADDY_VERSION}
    restart: unless-stopped
    command: caddy reverse-proxy --from ${HOST} --to app:3000
    ports:
      - 80:80
      - 443:443
      - 443:443/udp
    volumes:
      - ./caddy:/data/caddy
EOF
docker compose up -d
INICIO

if ! gcloud compute instances describe "$NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$NAME" --zone="$ZONE" \
    --machine-type=e2-micro \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --address="$IP" --tags="$NAME" --shielded-secure-boot \
    --metadata="docuseal-host=$HOST,docuseal-version=$DOCUSEAL_VERSION,caddy-version=$CADDY_VERSION" \
    --metadata-from-file=startup-script="$STARTUP"
else
  echo "La maquina $NAME ya existe; no se cambia."
fi
rm -f "$STARTUP"

# Copias diarias del disco, guardadas 14 dias.
if ! gcloud compute resource-policies describe "$NAME-diario" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule "$NAME-diario" --region="$REGION" \
    --daily-schedule --start-time=08:00 --max-retention-days=14
fi
gcloud compute disks add-resource-policies "$NAME" --zone="$ZONE" \
  --resource-policies="$NAME-diario" 2>/dev/null || true

# Alerta de presupuesto (avisa por correo al 50%, 90% y 100% de 20 USD).
BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)')"
BILLING="${BILLING#billingAccounts/}"
if ! gcloud billing budgets list --billing-account="$BILLING" --format='value(displayName)' 2>/dev/null | grep -qx "Firmas QAgency"; then
  gcloud billing budgets create --billing-account="$BILLING" --display-name="Firmas QAgency" \
    --budget-amount=20USD --filter-projects="projects/$PROJECT" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
fi

echo
echo "Listo. En unos 5 a 10 minutos abra: https://$HOST"
echo "Ahi se crea el usuario administrador de DocuSeal."
