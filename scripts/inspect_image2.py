from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png").convert("RGB")
w, h = img.size

# Let's inspect pixel colors at some points
print("Corners:")
print("Top-left (0,0):", img.getpixel((0, 0)))
print("Top-right (w-1,0):", img.getpixel((w - 1, 0)))
print("Bottom-left (0,h-1):", img.getpixel((0, h - 1)))
print("Bottom-right (w-1,h-1):", img.getpixel((w - 1, h - 1)))

# Let's inspect along the left border to see what colors are there
left_colors = [img.getpixel((0, y)) for y in range(0, h, h // 10)]
print("Left border sample colors:", left_colors)

# Let's print the colors of a horizontal slice at y=500
slice_colors = [img.getpixel((x, 500)) for x in range(0, w, w // 10)]
print("Horizontal slice at y=500:", slice_colors)
