const MAX_DATA_URL_BYTES = 110_000;

function approxDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.ceil(base64.length * 0.75);
}

async function fileToImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // Revoke after drawing, not here. Caller owns cleanup through returned image.src.
  }
}

export async function compressImageForFirestore(file: File, options: { maxDimension?: number; maxBytes?: number } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  const maxDimension = options.maxDimension || 960;
  const maxBytes = options.maxBytes || MAX_DATA_URL_BYTES;
  const image = await fileToImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.fillStyle = '#0B111C';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.82;
    let result = canvas.toDataURL('image/webp', quality);
    while (approxDataUrlBytes(result) > maxBytes && quality > 0.32) {
      quality -= 0.08;
      result = canvas.toDataURL('image/webp', quality);
    }

    if (approxDataUrlBytes(result) > maxBytes) {
      const shrink = Math.sqrt(maxBytes / approxDataUrlBytes(result)) * 0.9;
      const second = document.createElement('canvas');
      second.width = Math.max(320, Math.round(canvas.width * shrink));
      second.height = Math.max(240, Math.round(canvas.height * shrink));
      const secondContext = second.getContext('2d', { alpha: false });
      if (!secondContext) throw new Error('No se pudo terminar de comprimir la imagen.');
      secondContext.fillStyle = '#0B111C';
      secondContext.fillRect(0, 0, second.width, second.height);
      secondContext.drawImage(canvas, 0, 0, second.width, second.height);
      result = second.toDataURL('image/webp', 0.62);
    }

    if (approxDataUrlBytes(result) > maxBytes * 1.25) throw new Error('La foto sigue siendo demasiado pesada. Prueba con otra imagen.');
    return result;
  } finally {
    if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
  }
}
