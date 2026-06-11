/**
 * A high-performance, self-contained Sobel filter library for edge detection.
 * Designed for both browser and Node.js environments.
 */

export function Sobel(imageData) {
    const width = Number(imageData.width);
    const height = Number(imageData.height);
    const data = imageData.data;

    if (!data || width <= 0 || height <= 0) {
        throw new Error("Invalid image data or dimensions");
    }

    // Convert to grayscale using standard ITU-R BT.709 luminance values.
    // Pre-allocating a single byte per pixel instead of 4 bytes per pixel.
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < gray.length; i++) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // Allocate the output array matching the layout of the original Sobel package.
    const out = new Uint8ClampedArray(width * height * 4);

    const getGray = (x, y) => {
        // Clamp coordinates to image boundaries
        const px = Math.min(Math.max(0, x), width - 1);
        const py = Math.min(Math.max(0, y), height - 1);
        return gray[py * width + px];
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Horizontal Sobel Kernel (Kernel X)
            // -1,  0,  1
            // -2,  0,  2
            // -1,  0,  1
            const pixelX = 
                -1 * getGray(x - 1, y - 1) + 1 * getGray(x + 1, y - 1) +
                -2 * getGray(x - 1, y)     + 2 * getGray(x + 1, y) +
                -1 * getGray(x - 1, y + 1) + 1 * getGray(x + 1, y + 1);

            // Vertical Sobel Kernel (Kernel Y)
            // -1, -2, -1
            //  0,  0,  0
            //  1,  2,  1
            const pixelY = 
                -1 * getGray(x - 1, y - 1) - 2 * getGray(x, y - 1) - 1 * getGray(x + 1, y - 1) +
                 1 * getGray(x - 1, y + 1) + 2 * getGray(x, y + 1) + 1 * getGray(x + 1, y + 1);

            const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
            const idx = (y * width + x) * 4;
            const val = Math.min(255, Math.round(magnitude));
            out[idx] = val;
            out[idx + 1] = val;
            out[idx + 2] = val;
            out[idx + 3] = 255;
        }
    }

    out.toImageData = function() {
        if (typeof ImageData === 'function') {
            return new ImageData(out, width, height);
        }
        return { width, height, data: out };
    };

    return out;
}

export default Sobel;
