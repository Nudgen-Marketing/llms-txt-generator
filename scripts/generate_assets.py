import os
import subprocess
import time
from PIL import Image

# Config
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE_DIR = "/Users/mac/Projects/llms-txt-generator"
SCRIPTS_DIR = os.path.join(BASE_DIR, "scripts")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

tasks = [
    {
        "html": "screenshot1.html",
        "png": "screenshot1.png",
        "width": 1280,
        "height": 800
    },
    {
        "html": "screenshot2.html",
        "png": "screenshot2.png",
        "width": 1280,
        "height": 800
    },
    {
        "html": "small_promo.html",
        "png": "small_promo_tile.png",
        "width": 440,
        "height": 280
    },
    {
        "html": "marquee_promo.html",
        "png": "marquee_promo_tile.png",
        "width": 1400,
        "height": 560
    }
]

def generate_assets():
    for task in tasks:
        html_path = os.path.join(SCRIPTS_DIR, task["html"])
        output_png = os.path.join(ASSETS_DIR, task["png"])
        width = task["width"]
        height = task["height"]
        
        print(f"Generating {task['png']} from {task['html']} ({width}x{height})...")
        
        # Build command
        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--window-size={width},{height}",
            f"--screenshot={output_png}",
            f"file://{html_path}"
        ]
        
        print(f"Running command: {' '.join(cmd)}")
        # Run process
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error generating screenshot: {result.stderr}")
            continue
            
        # Wait a moment for file write
        time.sleep(0.5)
        
        if not os.path.exists(output_png):
            print(f"Error: Screenshot file {output_png} was not created!")
            continue
            
        # Post-process image with PIL to convert to 24-bit RGB PNG (removes alpha)
        try:
            img = Image.open(output_png)
            print(f"Opened {output_png} (size: {img.size}, mode: {img.mode})")
            rgb_img = img.convert("RGB")
            rgb_img.save(output_png, "PNG")
            print(f"Successfully converted {output_png} to 24-bit RGB (no alpha)")
        except Exception as e:
            print(f"Failed to post-process {output_png}: {e}")

if __name__ == "__main__":
    generate_assets()
