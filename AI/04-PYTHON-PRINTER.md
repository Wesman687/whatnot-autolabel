# Python Printer Integration Documentation

## 📁 Location: `/print-label.py`

## 🎯 Purpose
Handles the actual printing to Brother M221 label printer, formatting win data into properly positioned text and sending it to the Windows print queue via Python's win32print module.

## 📋 Dependencies
```python
from PIL import Image, ImageDraw, ImageFont
import win32print
import win32ui
import sys
import json
```

**Required Packages**:
- `Pillow` (PIL) - Image creation and text rendering
- `pywin32` - Windows printer API access
- `sys` - Command line argument handling  
- `json` - Data parsing from server

## 🖨️ Brother M221 Printer Specifications

### Label Dimensions
- **Physical Size**: 12mm x 29mm (0.47" x 1.14")
- **Print Resolution**: 180 DPI
- **Canvas Size**: 354x236 pixels
- **Print Area**: ~340x220 pixels (with margins)

### Coordinate System
```
(0,0) ──────────────────── (354,0)
  │                           │
  │    PRINTABLE AREA         │
  │                           │  
  │                           │
(0,236) ────────────────── (354,236)
```

## 🎨 Label Layout Design

### Fixed Positioning System
```python
# Label dimensions (30x20 mm @ 300 DPI)
LABEL_WIDTH = 354
LABEL_HEIGHT = 236

# Position tuning
LEFT_OFFSET = -63
TOP_OFFSET = -42
BUYER_RIGHT_ADJUST = 65
BOTTOM_DOWN_ADJUST = -5  # Moved UP so bottom text isn't cut off
LINE_SPACING = 5
```

### Layout Structure
- **Buyer Name**: Left-aligned, truncated to 11 characters max, font size 26
- **Item Description**: Left-aligned, wrapped to 2 lines max, font size 28
- **Price**: Fixed X position (220 + LEFT_OFFSET), same line as buyer, font size 26
- **Bottom Text**: Center-aligned, two lines:
  - "Miracle-Coins.com" (font size 24)
  - "FB: @miraclecoinz" (font size 24)

### Visual Layout
```
┌─────────────────────────────────┐
│                                 │
│  BUYER NAME (11 chars)    PRICE│ ← Same line, price at fixed X
│  ITEM LINE 1                    │ ← Wrapped to 2 lines max
│  ITEM LINE 2                    │
│                                 │
│        Miracle-Coins.com        │ ← Center-aligned
│        FB: @miraclecoinz        │ ← Center-aligned
│                                 │
└─────────────────────────────────┘
```

**Text Positioning**:
- All text is vertically centered on the label
- Buyer and item are left-aligned with `LEFT_OFFSET + BUYER_RIGHT_ADJUST`
- Price is at fixed X coordinate: `220 + LEFT_OFFSET`
- Bottom text is center-aligned with `BOTTOM_DOWN_ADJUST` to prevent cutoff

## 🔧 Core Functions

### `create_label_image(winner_name, item_description, price)`

**Purpose**: Creates a PIL Image object with properly formatted label content

```python
def create_label_image(winner_name, item_description, price):
    # Create blank white canvas
    img = Image.new('RGB', (354, 236), 'white')
    draw = ImageDraw.Draw(img)
    
    # Font setup (system default)
    try:
        font_large = ImageFont.truetype("arial.ttf", 24)
        font_medium = ImageFont.truetype("arial.ttf", 18)
        font_small = ImageFont.truetype("arial.ttf", 14)
    except:
        # Fallback to default font if Arial not available
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
```

### Text Positioning Logic

#### Winner Name (11 Character Limit)
```python
# Truncate long usernames with ellipsis
if len(winner_name) > 11:
    display_name = winner_name[:10] + "."
else:
    display_name = winner_name

# Bold, large font for winner name
draw.text((LEFT_OFFSET, NAME_Y), display_name, fill='black', font=font_large)
```

**Rationale**: 11 characters fits comfortably on M221 label width without crowding

#### Item Description (Multi-line Support)
```python
# Wrap long item descriptions
def wrap_text(text, font, max_width):
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        test_line = ' '.join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        line_width = bbox[2] - bbox[0]
        
        if line_width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
                current_line = [word]
            else:
                lines.append(word)  # Single word too long
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return lines

# Apply text wrapping
max_width = 300  # Pixels available for text
wrapped_lines = wrap_text(item_description, font_medium, max_width)

# Draw each line with proper spacing
line_height = 20
for i, line in enumerate(wrapped_lines[:2]):  # Max 2 lines
    y_pos = ITEM_Y + (i * line_height)
    draw.text((LEFT_OFFSET, y_pos), line, fill='black', font=font_medium)
```

#### Price (Fixed Position)
```python
# Price always positioned at x=220 for consistent alignment
if price and price != 'null':
    # Clean price formatting
    clean_price = str(price).strip()
    if clean_price and clean_price != '0':
        draw.text((220, PRICE_Y), clean_price, fill='black', font=font_large)
```

**Fixed X-Coordinate**: Ensures prices align vertically across all labels for easy scanning

#### Branding
```python
# Small "whatnot" text for source identification
draw.text((LEFT_OFFSET, BRANDING_Y), "whatnot", fill='gray', font=font_small)
```

### `print_to_m221(image)`

**Purpose**: Sends PIL Image to Brother M221 printer via Windows print system

```python
def print_to_m221(image):
    try:
        # Get default printer (should be M221)
        printer_name = win32print.GetDefaultPrinter()
        print(f"Printing to: {printer_name}")
        
        # Create device context
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(printer_name)
        
        # Start print job
        hdc.StartDoc("WhatnotAutoPrint Label")
        hdc.StartPage()
        
        # Convert PIL image to bitmap
        bmp = image_to_bitmap(image)
        
        # Print bitmap to device context
        hdc.DrawBitmap(bmp, (0, 0))
        
        # Finish print job
        hdc.EndPage()
        hdc.EndDoc()
        
        print("✅ Label printed successfully")
        return True
        
    except Exception as e:
        print(f"❌ Print error: {str(e)}")
        return False
```

### `image_to_bitmap(pil_image)`

**Purpose**: Converts PIL Image to Windows bitmap format for printing

```python
def image_to_bitmap(pil_image):
    # Convert PIL image to Windows-compatible format
    rgb_image = pil_image.convert('RGB')
    
    # Get image dimensions
    width, height = rgb_image.size
    
    # Create bitmap header
    bmp_info = win32ui.BITMAPINFO()
    bmp_info.bmiHeader.biSize = 40
    bmp_info.bmiHeader.biWidth = width
    bmp_info.bmiHeader.biHeight = -height  # Negative for top-down
    bmp_info.bmiHeader.biPlanes = 1
    bmp_info.bmiHeader.biBitCount = 24
    bmp_info.bmiHeader.biCompression = 0
    
    # Convert image data to bitmap
    image_data = rgb_image.tobytes()
    
    return win32ui.CreateBitmap(bmp_info, image_data)
```

## 📥 Command Line Interface

### Input Format
The script expects command-line arguments (not JSON):

```bash
python print-label.py <buyer> <item> [price]
```

**Arguments**:
- `buyer`: Buyer/winner username (required)
- `item`: Item description (required)
- `price`: Price string, e.g., "$25.00" (optional)

**Examples**:
```bash
python print-label.py "buyer123" "Rare Coin Set" "$25.00"
python print-label.py "winner456" "Giveaway Prize"
```

### Argument Parsing
```python
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python print-label.py <buyer> <item> [price]")
        sys.exit(1)

    buyer = sys.argv[1]
    item = sys.argv[2]
    price = sys.argv[3] if len(sys.argv) > 3 else None
    print_label(buyer, item, price)
```

## 🔗 Server Integration

### Called from `printer.js`
```javascript
// server/printer.js calls Python script
const { exec } = require('child_process');
const path = require('path');

function printLabel(data) {
    const now = Date.now();
    
    // Print cooldown (1.5 seconds)
    if (now - lastPrintTime < PRINT_COOLDOWN) {
        console.log("⏳ Cooldown active — skipped duplicate print");
        return;
    }
    lastPrintTime = now;
    
    const buyer = data.name || "Unknown";
    const item = data.item || "Whatnot Item";
    const price = data.price || null;
    
    // Get paths
    const pythonScript = path.join(__dirname, "..", "print-label.py");
    const pythonExe = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    
    // Build command with arguments
    let command = `"${pythonExe}" "${pythonScript}" "${buyer}" "${item}"`;
    if (price) {
        command += ` "${price}"`;
    }
    
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.log("❌ PRINT FAILED:", err.message);
        } else {
            console.log("✅ PRINTED");
        }
    });
}
```

**Note**: Uses virtual environment Python executable (`.venv/Scripts/python.exe`) for Windows compatibility.

### Data Flow
1. **Server**: Receives win event from Chrome extension
2. **Validation**: Checks duplicates, exclusions, active show
3. **Label Object**: Creates label data with `{ name, item, price, type, timestamp }`
4. **Python Call**: Executes `print-label.py` with command-line arguments
   - Uses virtual environment Python: `.venv/Scripts/python.exe`
   - Arguments: `buyer item [price]`
5. **Printing**: Python creates PIL image and sends to Brother M221 printer
6. **Response**: Success/failure logged to server console

## 🎛️ Printer Configuration

### Brother M221 Setup
1. **Install Driver**: Brother M221 printer driver from Brother website
2. **Set Default**: Make M221 the default printer in Windows
3. **Test Print**: Use Windows test page to verify connectivity
4. **Label Loading**: Insert 12mm white tape cassette

### Windows Print Queue
```python
# List all available printers
printers = [printer[2] for printer in win32print.EnumPrinters(2)]
print("Available printers:", printers)

# Check if M221 is available
m221_found = any('M221' in printer for printer in printers)
print(f"M221 detected: {m221_found}")
```

### Label Specifications
- **Tape Width**: 12mm (0.47 inches)
- **Tape Color**: White with black text
- **Adhesive**: Permanent adhesive for shipping labels
- **Length**: Cut-to-length (automatic cutting)

## 🛠️ Font and Rendering

### Font Fallback System
```python
def get_font(size):
    font_options = [
        "arial.ttf",           # Primary choice
        "calibri.ttf",         # Windows alternative  
        "segoeui.ttf",         # Another Windows font
        "C:/Windows/Fonts/arial.ttf"  # Absolute path
    ]
    
    for font_path in font_options:
        try:
            return ImageFont.truetype(font_path, size)
        except:
            continue
    
    # Final fallback to default
    return ImageFont.load_default()
```

### Text Measurements
```python
# Accurate text width calculation
def get_text_width(text, font):
    bbox = ImageDraw.Draw(Image.new('RGB', (1, 1))).textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]

# Center text horizontally
def center_text(text, font, canvas_width):
    text_width = get_text_width(text, font)
    x_pos = (canvas_width - text_width) // 2
    return x_pos
```

## 🔍 Debugging and Troubleshooting

### Image Preview (Development)
```python
# Save label image for debugging
def save_debug_image(image, filename="debug_label.png"):
    image.save(filename)
    print(f"Debug image saved: {filename}")

# Enable in development mode
if __name__ == "__main__" and "--debug" in sys.argv:
    image = create_label_image("testuser", "Test Item Description", "$10.00")
    save_debug_image(image)
```

### Print Queue Monitoring
```python
# Check print job status
def check_print_queue():
    jobs = win32print.EnumJobs(printer_handle, 0, -1, 1)
    for job in jobs:
        print(f"Job ID: {job['JobId']}, Status: {job['Status']}")
```

### Error Diagnostics
```python
# Comprehensive error reporting
def diagnose_printer_issues():
    try:
        # Test 1: Check if printer exists
        printers = win32print.EnumPrinters(2)
        print(f"Found {len(printers)} printers")
        
        # Test 2: Check default printer
        default = win32print.GetDefaultPrinter()
        print(f"Default printer: {default}")
        
        # Test 3: Check M221 specifically
        m221_found = any('M221' in p[2] for p in printers)
        print(f"M221 available: {m221_found}")
        
        # Test 4: Try to open printer
        handle = win32print.OpenPrinter(default)
        win32print.ClosePrinter(handle)
        print("Printer handle: OK")
        
    except Exception as e:
        print(f"Diagnosis failed: {e}")
```

## 📊 Performance Considerations

### Image Creation Speed
- **Canvas Size**: 354x236 pixels is small, renders quickly
- **Font Loading**: Cached after first load
- **Memory Usage**: ~300KB per label image (RGB)

### Print Queue Efficiency  
- **Batch Jobs**: Each label is separate print job
- **Spooling**: Windows handles queue management
- **Speed**: ~2-3 seconds per label (including processing)

## 🔒 Security Considerations

### Input Validation
```python
# Sanitize inputs to prevent code injection
def sanitize_text(text):
    if not isinstance(text, str):
        return str(text)
    
    # Remove potentially dangerous characters
    dangerous_chars = ['<', '>', '&', '"', "'", '\x00']
    for char in dangerous_chars:
        text = text.replace(char, '')
    
    # Limit length to prevent buffer issues
    return text[:100]
```

### File System Access
- **Read-Only**: Script only reads font files, no file creation
- **Printer Access**: Limited to print queue operations
- **No Network**: All operations are local to the system

## 🎯 Label Quality Optimization

### Text Clarity
- **Font Size**: Optimized for 180 DPI resolution
- **Contrast**: Black text on white background for maximum readability
- **Spacing**: Adequate line height prevents text overlap

### Layout Consistency
- **Fixed Positions**: All labels have identical layout
- **Price Alignment**: Consistent x=220 coordinate for price column
- **Name Truncation**: Prevents layout breaking with long usernames

### Print Reliability
- **Error Recovery**: Graceful failure handling
- **Job Monitoring**: Can detect failed print jobs
- **Queue Management**: Integrates with Windows print spooler

## 📈 Future Enhancements

### Potential Improvements
1. **QR Codes**: Add tracking QR codes to labels
2. **Barcode Support**: Generate barcodes for inventory systems  
3. **Template System**: Multiple label layouts for different use cases
4. **Batch Printing**: Print multiple labels in single job
5. **Preview Mode**: Show label image before printing

### Code Extensibility
```python
# Template system structure
class LabelTemplate:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.elements = []
    
    def add_text(self, text, x, y, font, color='black'):
        self.elements.append({
            'type': 'text',
            'content': text,
            'position': (x, y),
            'font': font,
            'color': color
        })
    
    def render(self):
        img = Image.new('RGB', (self.width, self.height), 'white')
        draw = ImageDraw.Draw(img)
        
        for element in self.elements:
            if element['type'] == 'text':
                draw.text(
                    element['position'],
                    element['content'],
                    fill=element['color'],
                    font=element['font']
                )
        
        return img
```