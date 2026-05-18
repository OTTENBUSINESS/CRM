import { jsPDF } from 'jspdf';

export interface CertificateData {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string | null;
  checkedInAt?: string | null;
}

function loadImageTinted(url: string, r: number, g: number, b: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Get image data and tint dark pixels to the desired color
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (alpha > 0) {
          // The logo is black on transparent — replace dark pixels with orange
          const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          if (brightness < 128) {
            const factor = 1 - brightness / 128;
            pixels[i] = Math.round(r * factor + pixels[i] * (1 - factor));
            pixels[i + 1] = Math.round(g * factor + pixels[i + 1] * (1 - factor));
            pixels[i + 2] = Math.round(b * factor + pixels[i + 2] * (1 - factor));
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

export async function generateCertificate(data: CertificateData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const W = 297;
  const H = 210;

  // =============================================
  // PREMIUM MINIMALIST CERTIFICATE
  // White canvas + orange accents + strong typography
  // =============================================

  // === BASE: Pure white ===
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // === LEFT ACCENT BAR ===
  const barWidth = 16;
  doc.setFillColor(234, 88, 12); // orange-600
  doc.rect(0, 0, barWidth, H, 'F');

  // Darker edge
  doc.setFillColor(194, 65, 12); // orange-700
  doc.rect(0, 0, 2.5, H, 'F');

  // === SUBTLE BOTTOM ACCENT ===
  doc.setFillColor(234, 88, 12);
  doc.rect(barWidth, H - 1.2, W - barWidth, 1.2, 'F');

  // === LOGO (top-right, tinted orange) ===
  try {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(234, 88, 12);
    doc.text('CRM', W - 30, 30, { align: 'right' });
  } catch {
    // Fallback
  }

  // === CONTENT AREA ===
  const contentX = barWidth + 26;
  const contentMaxW = W - contentX - 40;

  // === CERTIFICATE LABEL — elegant letter-spacing ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(190, 190, 190);
  doc.text('C E R T I F I C A D O   D E   P A R T I C I P A Ç Ã O', contentX, 36);

  // === THIN SEPARATOR ===
  doc.setDrawColor(235, 235, 235);
  doc.setLineWidth(0.3);
  doc.line(contentX, 41, contentX + 70, 41);

  // === "Certificamos que" ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(150, 150, 150);
  doc.text('Certificamos que', contentX, 58);

  // === PARTICIPANT NAME — hero ===
  const nameText = data.participantName;
  let nameFontSize = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(nameFontSize);
  let nameWidth = doc.getTextWidth(nameText);
  while (nameWidth > contentMaxW && nameFontSize > 18) {
    nameFontSize -= 2;
    doc.setFontSize(nameFontSize);
    nameWidth = doc.getTextWidth(nameText);
  }
  doc.setTextColor(23, 23, 23);
  doc.text(nameText, contentX, 76);

  // === ORANGE ACCENT BAR UNDER NAME ===
  doc.setFillColor(234, 88, 12);
  doc.rect(contentX, 80, 45, 2, 'F');

  // === "participou da imersão presencial" ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(150, 150, 150);
  doc.text('participou da imersão presencial de', contentX, 96);

  // === TOPIC: Inteligência Artificial para Negócios ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(23, 23, 23);
  doc.text('Inteligência Artificial para Negócios', contentX, 108);

  // === EVENT NAME (orange) ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(234, 88, 12);
  doc.text(data.eventName, contentX, 120);

  // === DATE & LOCATION ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(140, 140, 140);

  let infoLine = data.eventDate;
  if (data.eventLocation) {
    infoLine += `   ·   ${data.eventLocation}`;
  }
  doc.text(infoLine, contentX, 132);

  // === TOPIC TAGS — subtle context ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 180);
  doc.text('Agentes de IA  ·  Automação de Vendas  ·  WhatsApp Business  ·  Implementação Prática', contentX, 142);

  // === SIGNATURE SECTION ===
  const sigY = 170;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text('Frank Costa', contentX, sigY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(190, 190, 190);
  doc.text('Organizador · IA na Prática', contentX, sigY + 9.5);

  // === FOOTER: Brand + URL ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(210, 210, 210);
  doc.text('your-app-url.com', W - 26, H - 8, { align: 'right' });

  // === DOWNLOAD ===
  const safeName = data.participantName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');

  doc.save(`certificado-${safeName}.pdf`);
}
