#!/bin/bash
# Q Agency Toolbox: crea el servidor de firmas (DocuSeal) en Google Cloud y
# le pone la pasarela que guarda la clave de la API.
# Se corre en Cloud Shell (la terminal dentro de la consola de Google
# Cloud), con el proyecto ya elegido y la facturacion activa:
#   bash crear-servidor.sh
# La primera vez crea: IP fija, cortafuegos (solo 80/443; SSH solo por IAP),
# la maquina e2-micro con Ubuntu 24.04, copias diarias del disco (14 dias) y
# una alerta de presupuesto de 20 USD. No toca datos de clientes.
# Despues, con DocuSeal ya en marcha, se corre otra vez para darle la clave
# de la API: queda solo en el servidor, y el script muestra el codigo de
# firma de cada oficina, que va en el archivo del equipo de la herramienta.
#   bash crear-servidor.sh --codigos-nuevos   cambia los dos codigos
set -euo pipefail

NUEVOS=0
for arg in "$@"; do
  case "$arg" in
    --codigos-nuevos) NUEVOS=1 ;;
    *) echo "Opcion desconocida: $arg (la unica es --codigos-nuevos)"; exit 1 ;;
  esac
done

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
trap 'rm -f "$STARTUP"' EXIT
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
HOST="$(md docuseal-host)"
cat > .env <<EOF
HOST=$HOST
DOCUSEAL_VERSION=$(md docuseal-version)
CADDY_VERSION=$(md caddy-version)
EOF
# --- pasarela ---
# La pasarela: un pedido que trae el codigo de una oficina (X-Office-Code)
# llega a DocuSeal con la clave de la API, que solo esta en este servidor
# (pasarela.env, que este script no reescribe). Solo pasan los pedidos que
# usa el ayudante de firma. Un pedido sin codigo pasa igual que antes.
leer() { if [ -f pasarela.env ]; then sed -n "s/^$1=//p" pasarela.env | head -n 1; fi; }
CLAVE="$(leer DOCUSEAL_KEY)"
CQ="$(leer CODIGO_QAGENCY)"
CA="$(leer CODIGO_ATH)"
if [[ "$CLAVE" =~ ^[A-Za-z0-9_-]{16,200}$ && "$CQ" =~ ^[A-Za-z0-9_-]{32,128}$ && "$CA" =~ ^[A-Za-z0-9_-]{32,128}$ && "$CQ" != "$CA" ]]; then
  OFICINA="@oficina header_regexp X-Office-Code ^(?:$CQ|$CA)\$
		route @oficina {
			# Caddy compara la ruta ya decodificada y DocuSeal recibe la
			# original: con %, /. o // podrian no ser la misma ruta.
			@raro vars_regexp {http.request.uri} (%|/[.]|//)
			header @raro Content-Type application/json
			respond @raro \`{\"error\":\"ruta\"}\` 400
			request_header -X-Office-Code
			request_header X-Auth-Token \"$CLAVE\"
			@enviar {
				method POST
				path /api/submissions
			}
			@leer {
				method GET
				path_regexp ^/api/submissions(/[0-9]+(/documents)?)?\$
			}
			@cambiar {
				method PUT
				path_regexp ^/api/submitters/[0-9]+\$
			}
			@borrar {
				method DELETE
				path_regexp ^/api/submissions/[0-9]+\$
			}
			reverse_proxy @enviar app:3000
			reverse_proxy @leer app:3000
			reverse_proxy @cambiar app:3000
			reverse_proxy @borrar app:3000
			header Content-Type application/json
			respond \`{\"error\":\"ruta\"}\` 403
		}
		header Content-Type application/json
		respond \`{\"error\":\"codigo\"}\` 403"
else
  OFICINA="header Content-Type application/json
		respond \`{\"error\":\"pasarela\"}\` 503"
fi
umask 077
cat > Caddyfile <<EOF
$HOST {
	@codigo header X-Office-Code *
	route @codigo {
		$OFICINA
	}
	reverse_proxy app:3000
}
EOF
umask 022
# --- fin pasarela ---
# Si Caddy no acepta el Caddyfile, queda solo el proxy de siempre: DocuSeal
# sigue en linea y la pasarela no reenvia nada con codigo.
if ! docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" "caddy:$(md caddy-version)" \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "pasarela: Caddy no acepto el Caddyfile; queda solo el proxy" >&2
  printf '%s {\n\treverse_proxy app:3000\n}\n' "$HOST" > Caddyfile
fi
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
    command: caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
    ports:
      - 80:80
      - 443:443
      - 443:443/udp
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy:/data/caddy
EOF
docker compose up -d
# El Caddyfile pudo cambiar (la clave o los codigos): se vuelve a leer.
docker compose restart caddy
INICIO

METADATA="docuseal-host=$HOST,docuseal-version=$DOCUSEAL_VERSION,caddy-version=$CADDY_VERSION"
NUEVA=0
if ! gcloud compute instances describe "$NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$NAME" --zone="$ZONE" \
    --machine-type=e2-micro \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --address="$IP" --tags="$NAME" --shielded-secure-boot \
    --metadata="$METADATA" \
    --metadata-from-file=startup-script="$STARTUP"
  NUEVA=1
else
  # La maquina ya existe: solo se le pone el script de arranque de esta version.
  gcloud compute instances add-metadata "$NAME" --zone="$ZONE" \
    --metadata="$METADATA" --metadata-from-file=startup-script="$STARTUP"
fi

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

if [ "$NUEVA" = 1 ]; then
  echo
  echo "Listo. En unos 5 a 10 minutos abra: https://$HOST"
  echo "Ahi se crea el usuario administrador de DocuSeal. Despues copie la clave"
  echo "de la API (en DocuSeal: Settings > API) y corra este script otra vez."
  exit 0
fi

# La pasarela: la clave de la API se escribe aqui, sin que se vea, y va
# directo al servidor por SSH (IAP). No queda en Cloud Shell ni en ninguna
# computadora de la oficina.
echo
echo "Clave de la API de DocuSeal (en DocuSeal: Settings > API)."
echo "No se ve mientras se escribe. Enter deja la que ya tiene el servidor."
read -r -s -p "Clave: " CLAVE
echo
if [ -n "$CLAVE" ] && ! [[ "$CLAVE" =~ ^[A-Za-z0-9_-]{16,200}$ ]]; then
  echo "Esa no parece una clave de DocuSeal (solo letras, numeros, - y _). No se cambio nada."
  exit 1
fi

{
  printf 'CLAVE=%s\nNUEVOS=%s\n' "$CLAVE" "$NUEVOS"
  cat <<'SERVIDOR'
set -euo pipefail
cd /srv/docuseal
umask 077
leer() { if [ -f pasarela.env ]; then sed -n "s/^$1=//p" pasarela.env | head -n 1; fi; }
nuevo() { od -An -tx1 -N20 /dev/urandom | tr -d ' \n'; }
[ -n "$CLAVE" ] || CLAVE="$(leer DOCUSEAL_KEY)"
if [ -z "$CLAVE" ]; then
  echo "El servidor todavia no tiene la clave de DocuSeal: corra el script otra vez y escribala."
  exit 3
fi
CQ="$(leer CODIGO_QAGENCY)"
CA="$(leer CODIGO_ATH)"
if [ "$NUEVOS" = 1 ] || [ -z "$CQ" ]; then CQ="$(nuevo)"; fi
if [ "$NUEVOS" = 1 ] || [ -z "$CA" ]; then CA="$(nuevo)"; fi
printf 'DOCUSEAL_KEY=%s\nCODIGO_QAGENCY=%s\nCODIGO_ATH=%s\n' "$CLAVE" "$CQ" "$CA" > pasarela.env.nuevo
mv pasarela.env.nuevo pasarela.env
if ! google_metadata_script_runner startup </dev/null >/dev/null 2>&1; then
  echo "La clave quedo guardada, pero el servidor no pudo reiniciar la pasarela. Corra el script otra vez."
  exit 4
fi
if ! grep -q "header_regexp X-Office-Code" Caddyfile; then
  echo "La clave quedo guardada, pero la pasarela no quedo activa (Caddy no acepto la configuracion)."
  echo "DocuSeal sigue en linea. Avise para revisarlo: journalctl -u google-startup-scripts"
  exit 5
fi
echo
echo "Pasarela lista. Codigos de firma de las oficinas:"
echo "  QAgency: $CQ"
echo "  ATH:     $CA"
SERVIDOR
} | gcloud compute ssh "$NAME" --zone="$ZONE" --tunnel-through-iap --quiet \
  --command="sudo bash -s"
CLAVE=""

echo
echo "En la herramienta: Ajustes > Envio a firmar, escriba el codigo de cada"
echo "oficina y luego Ajustes > Equipo > Exportar equipo. Ese archivo se pasa"
echo "a las demas computadoras (Importar equipo): es secreto, solo dentro de"
echo "la oficina. Si se pierde o sale de la oficina:"
echo "  bash crear-servidor.sh --codigos-nuevos"
