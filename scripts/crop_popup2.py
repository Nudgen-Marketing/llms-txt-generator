from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png")
# Crop coordinates: x from 21 to 831, y from 21 to 498
cropped = img.crop((21, 21, 832, 499))
cropped.save("/Users/mac/Projects/llms-txt-generator/assets/cropped_scan.png")
print(f"Saved cropped scan popup to assets/cropped_scan.png with size {cropped.size}")
