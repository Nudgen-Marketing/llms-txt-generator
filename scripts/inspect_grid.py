from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png").convert("RGB")
w, h = img.size

grid_w, grid_h = 15, 15
dx = w // grid_w
dy = h // grid_h

print("Color grid:")
for gy in range(grid_h):
    row_strs = []
    for gx in range(grid_w):
        x = gx * dx + dx // 2
        y = gy * dy + dy // 2
        p = img.getpixel((x, y))
        # Represent color in hex
        hex_color = f"#{p[0]:02x}{p[1]:02x}{p[2]:02x}"
        row_strs.append(hex_color)
    print(" ".join(row_strs))
