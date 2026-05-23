from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png").convert("RGB")
w, h = img.size
cx = w // 2

print(f"Image 2 dimensions: {w}x{h}")
print("Colors along center column (y-axis):")
for y in range(0, h, 15):
    p = img.getpixel((cx, y))
    hex_color = f"#{p[0]:02x}{p[1]:02x}{p[2]:02x}"
    print(f"y={y:03d}: {hex_color} {p}")
