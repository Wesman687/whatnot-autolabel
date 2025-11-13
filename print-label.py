import sys
import win32print
import win32ui
from PIL import Image, ImageDraw, ImageFont, ImageWin

PRINTER_NAME = "M221 Printer"

# 30x20 mm @ 300 DPI
LABEL_WIDTH = 354
LABEL_HEIGHT = 236

# Position tuning
LEFT_OFFSET = -63
TOP_OFFSET = -42
BUYER_RIGHT_ADJUST = 65
BOTTOM_DOWN_ADJUST = -5     # <<< moved UP so FB isn't cut off
LINE_SPACING = 5


def wrap_text(text, font, max_width, draw):
    lines = []
    words = text.split(" ")

    current = ""
    for word in words:
        test = (current + " " + word).strip()
        w = draw.textbbox((0, 0), test, font=font)[2]

        if w <= max_width:
            current = test
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines


def print_label(buyer, item, price=None):
    img = Image.new("RGB", (LABEL_WIDTH, LABEL_HEIGHT), "white")
    draw = ImageDraw.Draw(img)

    try:
        font_buyer = ImageFont.truetype("arial.ttf", 26)
        font_item = ImageFont.truetype("arial.ttf", 28)
        font_small = ImageFont.truetype("arial.ttf", 24)  # <<< slightly larger
    except:
        font_buyer = font_item = font_small = ImageFont.load_default()

    # Wrap item into up to 2 lines
    item_lines = wrap_text(item, font_item, LABEL_WIDTH - 120, draw)[:2]

    # Calculate max width for buyer name (leave space for 4-digit prices like $1000+)
    price_width = 0
    if price:
        # Use a sample 4-digit price to calculate max width needed
        sample_price = "$9999"  # Max realistic price format
        price_bbox = draw.textbbox((0, 0), sample_price, font_buyer)
        price_width = price_bbox[2] - price_bbox[0] + 35  # Price width + margin
    
    max_buyer_width = LABEL_WIDTH - price_width - 50  # Leave extra margin for 4-digit prices
    
    # Truncate buyer name to max 11 characters
    truncated_buyer = buyer
    if len(buyer) > 11:
        truncated_buyer = buyer[:11] + "."

    # Build text block - buyer only (price will be drawn separately on same line)
    text_lines = [
        ("buyer", truncated_buyer, font_buyer, "left", BUYER_RIGHT_ADJUST),
    ]

    for il in item_lines:
        text_lines.append(("item", il, font_item, "left", BUYER_RIGHT_ADJUST))

    # Bottom text (bigger + lifted up)
    text_lines.append(("bottom", "MiracleCoins.com", font_small, "center", 0))
    text_lines.append(("bottom", "FB: @miraclecoinz", font_small, "center", 0))

    # Compute total height
    total_height = 0
    heights = []
    for _, text, font, _, _ in text_lines:
        h = draw.textbbox((0, 0), text, font=font)[3]
        heights.append(h)
        total_height += h + LINE_SPACING

    # Vertical center
    y = (LABEL_HEIGHT - total_height) // 2 + TOP_OFFSET

    # Clamp so bottom text won't fall off
    if y < 5:
        y = 5

    # Draw each line
    for (tag, text, font, align, adj), height in zip(text_lines, heights):
        if tag == "bottom" and text == "MiracleCoins.com":
            y += 6
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]

        if align == "left":
            x = 5 + LEFT_OFFSET + adj
        elif align == "right":
            x = LABEL_WIDTH - w - 10 + LEFT_OFFSET  # Right-aligned with 10px margin
        else:  # center
            x = (LABEL_WIDTH - w) // 2 + LEFT_OFFSET

        # Raise bottoms by using negative BOTTOM_DOWN_ADJUST
        yy = y + (BOTTOM_DOWN_ADJUST if tag == "bottom" else 0)

        # Final safety check
        if yy + height > LABEL_HEIGHT - 4:
            yy = LABEL_HEIGHT - height - 4

        draw.text((x, yy), text, font=font, fill="black")
        
        # If this is the buyer line and we have a price, draw price at FIXED position from left
        if tag == "buyer" and price:
            price_x = 220 + LEFT_OFFSET  # Fixed position - always starts at same X coordinate
            draw.text((price_x, yy), price, font=font_buyer, fill="black")

        y += height + LINE_SPACING

    # Print
    hDC = win32ui.CreateDC()
    hDC.CreatePrinterDC(PRINTER_NAME)
    hDC.StartDoc("Label")
    hDC.StartPage()

    dib = ImageWin.Dib(img)
    dib.draw(hDC.GetHandleOutput(), (0, 0, LABEL_WIDTH, LABEL_HEIGHT))

    hDC.EndPage()
    hDC.EndDoc()
    hDC.DeleteDC()

    print(f"Label printed for {buyer}: {item}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python print-label.py <buyer> <item> [price]")
        sys.exit(1)

    buyer = sys.argv[1]
    item = sys.argv[2]
    price = sys.argv[3] if len(sys.argv) > 3 else None
    print_label(buyer, item, price)
