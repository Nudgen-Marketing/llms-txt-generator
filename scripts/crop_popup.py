import sys
from PIL import Image

def analyze_and_crop(image_path, output_path):
    print(f"Analyzing {image_path}...")
    img = Image.open(image_path)
    width, height = img.size
    print(f"Dimensions: {width}x{height}, Mode: {img.mode}")

    # Let's inspect the colors along the center columns/rows to find the borders
    # Let's convert to RGB
    img_rgb = img.convert("RGB")
    
    # We want to find the bounding box of the popup.
    # The popup in the screenshot has a distinct container with a border.
    # Let's find the bounding box by looking for the border or background differences.
    # The background outside the card is usually a very dark color or solid.
    # Let's find the bounding box of pixels that differ from the top-left pixel color.
    bg_color = img_rgb.getpixel((5, 5))
    print(f"Detected background color (top-left): {bg_color}")
    
    # Find bounding box where pixel color differs significantly from background color
    threshold = 15 # threshold for color difference
    
    min_x, min_y = width, height
    max_x, max_y = 0, 0
    
    # Check pixels
    for y in range(height):
        for x in range(width):
            r, g, b = img_rgb.getpixel((x, y))
            diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])
            if diff > threshold:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
                
    print(f"Initial bounding box of content: x=[{min_x}, {max_x}], y=[{min_y}, {max_y}]")
    
    # Let's add a bit of padding or adjust it if it's too tight.
    # Wait, let's see. The popup card itself has a border. Let's inspect the actual cropped image.
    # If we crop with a tiny margin, we get the popup card itself.
    # Let's make sure the bounding box captures the card and its outer shadow if any.
    # Let's crop and save.
    cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    cropped.save(output_path)
    print(f"Saved cropped image to {output_path} with size {cropped.size}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python crop_popup.py <input> <output>")
        sys.exit(1)
    analyze_and_crop(sys.argv[1], sys.argv[2])
