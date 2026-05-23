from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png").convert("RGB")
w, h = img.size
cx = w // 2

print("Pixel colors around bottom card border in Image 2:")
for y in range(470, 520):
    p = img.getpixel((cx, y))
    hex_color = f"#{p[0]:02x}{p[1]:02x}{p[2]:02x}"
    print(f"y={y}: {hex_color} {p}")
