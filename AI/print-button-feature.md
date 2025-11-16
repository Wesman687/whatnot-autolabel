# Manual Print Button Feature

## Overview
The manual print button feature adds clickable print icons (🖨️) directly to item cards in the Whatnot seller interface. This allows for on-demand printing of shipping labels without relying on automatic win detection.

## Key Features

### 🎯 **Manual Printing**
- **Bypasses Pause Setting**: Manual print buttons work even when auto-printing is paused
- **Immediate Printing**: Click any 🖨️ icon to instantly print that specific item's label
- **Visual Feedback**: Button changes to ✅ briefly when clicked to confirm action

### 🏷️ **Label Data Extraction**
- **Buyer Name**: Extracted from "Buyer: username" text in item card
- **Item Title**: Uses the actual item title from the card (e.g., "Item in hand 124", "Canadian Silver Dime Givvy #15")
- **Price**: Extracted from "Payment Pending: $XX" or "Sold for $XX" text
- **Event Type**: Automatically detects sales vs giveaways based on price and context

### 🔧 **Technical Implementation**

#### Server Endpoints
- **Manual Print**: `POST /manual-print` - Bypasses pause setting, always prints
- **Auto Print**: `POST /event` - Respects pause setting for automatic detection

#### Button Injection
- **Target**: Item cards in Whatnot seller dashboard
- **Selector Strategy**: Looks for elements with buyer/payment information
- **Position**: Inline with item title text
- **Style**: Small green 🖨️ emoji with hover effects

#### Data Flow
```
Item Card → Extract Buyer/Title/Price → Manual Print Endpoint → Python Printer → Brother Label Printer
```

## Usage Instructions

### 1. **Setup**
- Extension must be loaded in Chrome/Edge
- Server must be running on localhost:7777
- Must be on Whatnot seller dashboard with sold items

### 2. **Button Appearance**
- Print buttons (🖨️) appear automatically next to item titles
- Only visible on item cards with buyer/payment information
- Buttons refresh when page content changes

### 3. **Printing Process**
1. Click the 🖨️ icon next to any item
2. Button briefly shows ✅ to confirm
3. Label prints immediately to Brother printer
4. Server logs the manual print action

### 4. **Troubleshooting**

#### No Buttons Appearing
- Check browser console for `testPrintButtons()` function
- Verify you're on seller dashboard with sold items
- Ensure extension is properly loaded

#### Buttons Not Printing
- Verify server is running on port 7777
- Check that Python printer setup is working
- Manual prints bypass pause setting but require active show

## Console Functions

### Debug Functions (Available in Browser Console)
```javascript
// Force refresh print buttons
testPrintButtons()

// Debug extracted item data
debugItemData()

// Test manual print system
// (Use with caution - will actually print)
```

## Configuration

### Server Settings
- **Pause State**: Manual prints ignore the pause setting
- **Active Show**: Requires an active show to be selected
- **Exclusions**: Manual prints respect exclusion filters
- **Giveaway Setting**: Respects giveaway printing enable/disable

### Extension Behavior
- **Auto-Injection**: Buttons added automatically when content loads/changes
- **Error Handling**: Silent error handling to prevent console spam
- **Performance**: Efficient DOM scanning with throttling

## File Locations
- **Extension Logic**: `extension/content.js` - `injectPrintButtons()` function
- **Server Endpoint**: `server/server.js` - `/manual-print` route
- **Print System**: `server/printer.js` - Label formatting and printing

## Notes
- Manual printing is designed for situations where auto-detection missed items or you need to reprint specific labels
- The system maintains all duplicate detection and logging features
- Print buttons work for both sales and giveaways
- Button positioning is optimized for Whatnot's current UI layout (as of Nov 2025)