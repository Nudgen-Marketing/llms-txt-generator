from PIL import Image

img = Image.open("/Users/mac/.gemini/antigravity-ide/brain/4e53a917-d824-46f4-a9d4-e98aa8976125/media__1779525444049.png").convert("RGB")
w, h = img.size

# Let's count how many dark pixels (close to (4, 9, 20) or (3, 5, 12)) are in each column and row.
# We will define a dark pixel as having R < 30, G < 35, B < 45.
def is_dark(p):
    return p[0] < 30 and p[1] < 35 and p[2] < 45

# Column analysis
dark_cols = []
for x in range(w):
    dark_count = sum(1 for y in range(h) if is_dark(img.getpixel((x, y))))
    if dark_count > h * 0.5: # More than 50% of the column is dark
        dark_cols.append(x)

# Row analysis
dark_rows = []
for y in range(h):
    dark_count = sum(1 for x in range(w) if is_dark(img.getpixel((x, y))))
    if dark_count > w * 0.5: # More than 50% of the row is dark
        dark_rows.append(y)

if dark_cols:
    print(f"Dark columns: {min(dark_cols)} to {max(dark_cols)}")
else:
    print("No dark columns found")

if dark_rows:
    print(f"Dark rows: {min(dark_rows)} to {max(dark_rows)}")
else:
    print("No dark rows found")
