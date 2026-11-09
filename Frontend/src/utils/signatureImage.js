function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the selected signature image."));
    image.src = dataUrl;
  });
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected image file."));
    reader.readAsDataURL(file);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function extractSignature(dataUrl, selection = null) {
  const image = await loadImage(dataUrl);
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Image processing is unavailable in this browser.");
  sourceContext.drawImage(image, 0, 0);

  let x = 0;
  let y = 0;
  let width = source.width;
  let height = source.height;
  if (selection) {
    x = clamp(Math.floor(selection.x * source.width), 0, source.width - 1);
    y = clamp(Math.floor(selection.y * source.height), 0, source.height - 1);
    width = clamp(Math.ceil(selection.width * source.width), 1, source.width - x);
    height = clamp(Math.ceil(selection.height * source.height), 1, source.height - y);
  }

  const imageData = sourceContext.getImageData(x, y, width, height);
  const { data } = imageData;
  const cornerSize = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) / 8)));
  const corners = [
    [0, 0],
    [width - cornerSize, 0],
    [0, height - cornerSize],
    [width - cornerSize, height - cornerSize],
  ];
  let backgroundR = 0;
  let backgroundG = 0;
  let backgroundB = 0;
  let backgroundAlpha = 0;
  let sampleCount = 0;

  for (const [cornerX, cornerY] of corners) {
    for (let row = cornerY; row < cornerY + cornerSize; row += 1) {
      for (let column = cornerX; column < cornerX + cornerSize; column += 1) {
        const index = (row * width + column) * 4;
        backgroundR += data[index];
        backgroundG += data[index + 1];
        backgroundB += data[index + 2];
        backgroundAlpha += data[index + 3];
        sampleCount += 1;
      }
    }
  }

  backgroundR /= sampleCount;
  backgroundG /= sampleCount;
  backgroundB /= sampleCount;
  backgroundAlpha /= sampleCount;
  if (backgroundAlpha < 32) {
    backgroundR = 255;
    backgroundG = 255;
    backgroundB = 255;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = (row * width + column) * 4;
      if (data[index + 3] === 0) continue;

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const distance = Math.sqrt(
        (red - backgroundR) ** 2 +
        (green - backgroundG) ** 2 +
        (blue - backgroundB) ** 2
      );
      const alpha = clamp(Math.round((distance - 18) * 1.65), 0, data[index + 3]);
      data[index + 3] = alpha;

      if (alpha > 12) {
        minX = Math.min(minX, column);
        minY = Math.min(minY, row);
        maxX = Math.max(maxX, column);
        maxY = Math.max(maxY, row);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No signature strokes were detected. Crop the signature area manually.");
  }

  sourceContext.putImageData(imageData, x, y);
  const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.04));
  const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.12));
  const cropX = x + Math.max(0, minX - padX);
  const cropY = y + Math.max(0, minY - padY);
  const cropWidth = Math.min(width - Math.max(0, minX - padX), maxX - minX + 1 + padX * 2);
  const cropHeight = Math.min(height - Math.max(0, minY - padY), maxY - minY + 1 + padY * 2);

  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Image processing is unavailable in this browser.");
  outputContext.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL("image/png");
}
