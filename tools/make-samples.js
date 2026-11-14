/* Genera los PDF de muestra de la carpeta samples/. Todos los datos son ficticios.
   Sirven para probar o demostrar la herramienta sin usar documentos de clientes.
   Necesita Playwright (npm i -D playwright). Uso: node tools/make-samples.js */
const { chromium } = require('playwright');
const path = require('path');
const css = `<style>body{font:12px Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px}h2{font-size:15px;margin-top:18px}
table{border-collapse:collapse;width:100%}td,th{padding:5px 8px;text-align:left;vertical-align:top}.row{display:flex;gap:40px;margin:4px 0}
.nav{display:flex;gap:18px;font-size:11px;color:#555;border-bottom:1px solid #ccc;padding-bottom:8px}.k{display:inline-block;width:330px}.foot{margin-top:40px;font-size:10px;color:#666}</style>`;
const docs = {
'My Plans and Programs.pdf': `${css}
<div class="nav"><b>HealthCare.gov</b><span>Beatriz</span><span>Español</span><span>Log out</span></div>
<div class="nav"><span>My applications &amp; coverage</span><span>2027 application</span><span>Eligibility &amp; appeals</span><span>Application details</span><span>Report a life change</span></div>
<h1>My plans &amp; programs</h1>
<h2>Health</h2>
<div>Active</div>
<div style="width:300px"><b>Ambetter Standard Silver ($0 Virtual Care Visits + $50 monthly rewards for healthy activity)</b></div>
<div>68398FL0030046</div>
<table style="width:360px;margin-top:10px"><tr><td>Monthly premium</td><td>$850.12</td></tr><tr><td>Premium tax credit</td><td>-$824.72</td></tr><tr><td><b>You pay</b></td><td><b>$25.40</b></td></tr></table>
<table style="margin-top:14px"><tr><th>Member</th><th>Start date</th><th>End date</th><th>Action</th></tr>
<tr><td>Beatriz Diaz</td><td>Jan 1, 2027</td><td>Dec 31, 2027</td><td>REMOVE</td></tr>
<tr><td>Juan Carlos Diaz</td><td>Jan 1, 2027</td><td>Dec 31, 2027</td><td>REMOVE</td></tr>
<tr><td>Ana Diaz</td><td>Jan 1, 2027</td><td>Dec 31, 2027</td><td>REMOVE</td></tr></table>
<div class="row"><span>GO TO PLAN'S WEBSITE</span><span>PAY FOR HEALTH PLAN</span><span>CHANGE PLANS</span></div>
<h2>Coverage record</h2><div>Review your plan profile</div><div>Cancel health coverage</div>
<div class="foot">Privacy · Accessibility · Site map · Glossary · Contact us · Archive<br>A federal government website managed and paid for by the U.S. Centers for Medicare &amp; Medicaid Services. 7500 Security Boulevard, Baltimore, MD 21244</div>`,

'Eligibility Letter.pdf': `${css}
<div><b>Health Insurance Marketplace</b><br>Department of Health and Human Services<br>465 Industrial Boulevard<br>London, Kentucky 40750-0001</div>
<p>November 14, 2026</p><p>Beatriz Diaz<br>123 Main St<br>Miami, FL 33101</p>
<p>Application Date: November 14, 2026<br>Application ID: 4412345678</p>
<p>Dear Beatriz Diaz:</p>
<p>We reviewed your application for 2027 health coverage. This notice explains what your household qualifies for.</p>
<h1>Eligibility Notice</h1>
<h2>Eligibility Results</h2>
<table><tr><th>Household member(s)</th><th>Results</th><th>Next steps</th></tr>
<tr><td>Beatriz Diaz</td><td>• Eligible to purchase health coverage through the Marketplace<br>• Eligible for advance payments of the premium tax credit ($824.72 each month, which is $9,896.64 for the year, for your tax household)<br>• Eligible for cost-sharing reductions</td><td>• Choose a plan and make your first month's payment<br>• Send the Marketplace more information</td></tr>
<tr><td>Juan Carlos Diaz</td><td>• Eligible to purchase health coverage through the Marketplace</td><td>• Choose a plan</td></tr></table>
<h2>Send the Marketplace more information</h2>
<p>Your eligibility is temporary. We need more information to confirm what you told us.</p>
<table><tr><th>Household member</th><th>What to send</th><th>Deadline</th></tr>
<tr><td>Beatriz Diaz</td><td>Proof of yearly income</td><td>Send documents by February 12, 2027</td></tr></table>
<p>We used a yearly household income of $32,000.00 and a household size of 4 to decide what you qualify for.</p>
<div class="foot">Marketplace Call Center 1-800-318-2596</div>`,

'App Summary.pdf': `${css}
<div class="nav"><b>HealthCare.gov</b><span>Beatriz</span><span>Log out</span></div>
<h1>Review your application</h1>
<p>2027 application for individual &amp; family coverage</p><p>Application ID: 4412345678</p>
<h2>Household contact</h2>
<div><span class="k">First name</span>Beatriz</div><div><span class="k">Last name</span>Diaz</div>
<div><span class="k">Date of birth</span>03/14/1985</div><div><span class="k">Social Security number</span>***-**-1234</div>
<div><span class="k">Home address</span>123 Main St, Miami, FL 33101</div>
<h2>Household income</h2>
<div><span class="k">Job - Acme Cleaning LLC</span>$2,666.67 Monthly</div>
<div><span class="k">Expected yearly income</span>$32,000.00</div>
<div><span class="k">Tax household size</span>4</div>
<h2>Sign &amp; submit</h2><p>I agree to allow the Marketplace to use my income data, including information from tax returns.</p>`,

'Diaz Beatriz - Medicare App Summary ES.pdf': `${css}
<h1>Resumen de la solicitud de inscripción</h1>
<h2>AARP Medicare Advantage from UHC FL-0020 (HMO-POS)</h2>
<div><span class="k">Nombre del plan:</span>AARP Medicare Advantage from UHC FL-0020 (HMO-POS)</div>
<div><span class="k">H-PBP-SegmentID:</span>H1045-012-000</div>
<div><span class="k">Prima del plan:</span>$0.00</div>
<h2>Información del solicitante</h2>
<div><span class="k">Nombre:</span>Beatriz</div><div><span class="k">Apellido:</span>Diaz</div>
<div><span class="k">Fecha de nacimiento:</span>01/01/1958</div>
<div><span class="k">Número de Medicare:</span>1EG4-TE5-MK73</div>
<div><span class="k">Fecha de entrada en vigencia de servicios en el hospital (Parte A):</span>01/01/2023</div>
<div><span class="k">Fecha de entrada en vigencia de servicios médicos (Parte B):</span>02/01/2023</div>
<div><span class="k">Fecha de entrada en vigencia propuesta:</span>01/01/2027</div>
<div><span class="k">Período de elección:</span>AEP - Período de inscripción anual</div>
<div><span class="k">Número de ID de Medicaid:</span>9876543210</div>
<div><span class="k">Nombre del PCP:</span>Dr. Carlos Rivera</div><div><span class="k">ID del PCP:</span>000123456</div>
<h2>Información del agente</h2>
<div><span class="k">Nombre del agente:</span>Laura Gomez</div><div><span class="k">NPN:</span>12345678</div>
<div><span class="k">Id. de escritura:</span>1234567</div><div><span class="k">Confirmation Number:</span>A1B2C3D4E5</div>
<div><span class="k">Fecha de la firma:</span>11/14/2026</div>`,

'Humana Enrollment Confirmation.pdf': `${css}
<h1>Enrollment Application Confirmation</h1>
<table><tr><td>Confirmation Number</td><td>7H2K99Q1</td><td>Date submitted</td><td>11/14/2026</td></tr>
<tr><td>Plan name</td><td>Humana Gold Plus H1036-077 (HMO)</td><td>Monthly plan premium</td><td>$0.00</td></tr>
<tr><td>Applicant name</td><td>Beatriz Diaz</td><td>Date of birth</td><td>01/01/1958</td></tr>
<tr><td>Medicare Number</td><td>1EG4-TE5-MK73</td><td>Medicaid number</td><td></td></tr>
<tr><td>Hospital (Part A) Effective Date</td><td>01/01/2023</td><td>Medical (Part B) Effective Date</td><td>02/01/2023</td></tr>
<tr><td>Proposed effective date</td><td>01/01/2027</td><td>Election period</td><td>Annual Enrollment Period (AEP)</td></tr>
<tr><td>Primary Care Physician</td><td>Carlos Rivera MD</td><td>PCP ID</td><td>123456</td></tr>
<tr><td>Agent name</td><td>Laura Gomez</td><td>NPN</td><td>12345678</td></tr></table>`,

'SOA Diaz Beatriz.pdf': `${css}
<h1>Scope of Sales Appointment Confirmation Form</h1>
<p>The Centers for Medicare and Medicaid Services requires agents to document the scope of a marketing appointment prior to any sales meeting.</p>
<p>Please initial below beside the type of product(s) you want the agent to discuss.</p>
<p>BD Medicare Advantage Plans (Part C) and Cost Plans<br>BD Stand-alone Medicare Prescription Drug Plans (Part D)<br>__ Dental/Vision/Hearing Products</p>
<h2>Beneficiary or Authorized Representative Signature and Signature Date</h2>
<div class="row"><span>Signature: Beatriz Diaz</span><span>Signature Date: 11/12/2026</span></div>
<h2>To be completed by Agent</h2>
<table><tr><td>Agent Name: Laura Gomez</td><td>Agent Phone: (305) 555-0100</td></tr>
<tr><td>Beneficiary Name: Beatriz Diaz</td><td>Beneficiary Phone: (305) 555-0199</td></tr>
<tr><td>Initial Method of Contact: Phone call</td><td>Date Appointment Completed: 11/14/2026</td></tr></table>`,

'Payment Receipt.pdf': `${css}
<h1>Ambetter from Sunshine Health</h1><h2>Payment Confirmation</h2><p>Thank you for your payment.</p>
<div><span class="k">Confirmation Number</span>PAY123456789</div>
<div><span class="k">Payment Amount</span>$25.40</div>
<div><span class="k">Payment Date</span>11/14/2026</div>
<div><span class="k">Payment Method</span>Visa ending in 4242</div>
<div><span class="k">Member ID</span>U1234567801</div>
<div><span class="k">AutoPay</span>Enrolled</div>`,

'Dental Application.pdf': `${css}
<h1>Florida Combined Life Insurance Company, Inc.</h1>
<h2>BlueDental Choice Plus</h2>
<table><tr><td>Application ID: 2026111400123</td><td>Submission Type: Electronic</td></tr>
<tr><td>First Name: Beatriz</td><td>Last Name: Diaz</td></tr>
<tr><td>Requested Effective Date: 12/01/2026</td><td>Monthly Premium: $38.50</td></tr>
<tr><td>Agency Name: Agencia Demo</td><td>Agent Name: Laura Gomez</td></tr>
<tr><td>NPN: 12345678</td><td>State License Number: W123456</td></tr></table>
<p>Have you had dental coverage in the last 90 days? (Selected) No</p><p>There is a waiting period for major services. DPPO network.</p>`
};
(async () => {
  const out = process.argv[2] || path.join(__dirname, '..', 'samples');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, html] of Object.entries(docs)) {
    await page.setContent('<!doctype html><meta charset="utf-8">' + html);
    await page.pdf({ path: path.join(out, name), format: 'Letter' });
  }
  await browser.close();
  console.log(Object.keys(docs).join('\n'));
})();
