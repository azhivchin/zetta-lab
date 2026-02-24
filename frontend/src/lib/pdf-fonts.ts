let fontCache: { regular: string; bold: string } | null = null;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function registerCyrillicFonts(doc: InstanceType<typeof import("jspdf").default>): Promise<void> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/zetta";

  if (!fontCache) {
    const [regular, bold] = await Promise.all([
      fetchFontBase64(`${basePath}/fonts/PTSans-Regular.ttf`),
      fetchFontBase64(`${basePath}/fonts/PTSans-Bold.ttf`),
    ]);
    fontCache = { regular, bold };
  }

  doc.addFileToVFS("PTSans-Regular.ttf", fontCache.regular);
  doc.addFileToVFS("PTSans-Bold.ttf", fontCache.bold);
  doc.addFont("PTSans-Regular.ttf", "PTSans", "normal");
  doc.addFont("PTSans-Bold.ttf", "PTSans", "bold");
  doc.setFont("PTSans");
}
