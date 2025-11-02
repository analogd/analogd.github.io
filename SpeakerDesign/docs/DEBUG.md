# Debugging BoxSmith

## Enable Debug Mode

In browser console:
```javascript
localStorage.setItem('debug', 'true')
```

Then reload the page. A green debug panel will appear in bottom-right showing:
- When functions are called
- What data is being processed
- Errors and warnings

## Disable Debug Mode

```javascript
localStorage.setItem('debug', 'false')
```

## Browser Console Debugging

### Open Developer Tools
- **Safari**: Cmd+Option+I
- **Chrome**: Cmd+Option+J
- **Firefox**: Cmd+Option+K

### Key Things to Check

1. **Console Errors** (red text)
   - Look for JavaScript errors
   - Note which file and line number

2. **Network Tab**
   - Failed requests (404, 500 errors)
   - Check if all JS files load (200 status)

3. **Console Tab**
   - Type commands to inspect state:
   ```javascript
   App.project  // See current project
   App.currentBox  // See current box
   App.drivers  // See loaded drivers
   localStorage.getItem('currentProject')  // See saved project
   ```

4. **Sources Tab**
   - Set breakpoints in app.js
   - Step through code execution

## Common Issues

### Graphs Not Rendering
**Check:**
- Are there console errors about Chart.js?
- Is `GraphManager.init()` being called?
- Do visible designs have `results.frequencyResponse` data?

**Debug:**
```javascript
App.project.getVisibleDesigns()  // Should have designs
App.project.getVisibleDesigns()[0].results  // Should have data
```

### Comparison Table Shows "-"
**Check:**
- Do designs have `results` object?
- Are `results.f3`, `results.maxSpl20Hz` populated?

**Debug:**
```javascript
App.project.designs[0].results  // Should exist
App.project.designs[0].results.f3  // Should be a number
```

**Fix:**
- If results is null, design wasn't calculated properly
- Click "Pin Current Design" to recalculate

### Pin Current Design Fails
**Check:**
- Console errors during pinning
- Is `currentBox` created first?

**Debug:**
```javascript
App.currentBox  // Should exist after Calculate
App.currentDriver  // Should exist after Calculate
```

**Fix:**
- Click Calculate first
- Then click Pin Current Design

### Designs Not Persisting
**Check:**
- localStorage quota (usually 5-10MB)
- Is project being saved?

**Debug:**
```javascript
localStorage.getItem('currentProject')  // Should have JSON
JSON.parse(localStorage.getItem('currentProject'))  // Parse it
```

**Fix:**
- Clear localStorage: `localStorage.clear()`
- Reload page

## Debug Panel Output

With debug mode enabled, you'll see messages like:
```
[18:14:26] App.init() starting
[18:14:26] GraphManager initialized
[18:14:26] Project initialized: 1 designs
[18:14:26] Loaded 10 drivers
[18:14:26] Default design loaded, calculate() called
[18:14:27] Calculating design results for: SealedBox {...}
[18:14:27] Design results calculated: {f3: 29.4, ...}
[18:14:27] renderComparisonTable: 1 visible designs
[18:14:27] Design "UMII18 330L Sealed": results=true, f3=29.4, maxSpl=115.2
```

## Testing Workflow

1. **Enable debug mode**
   ```javascript
   localStorage.setItem('debug', 'true')
   ```

2. **Reload page**
   - Check debug panel for init messages
   - Check console for errors

3. **Test Calculate**
   - Change parameters
   - Click Calculate
   - Check if graphs render

4. **Test Pin Design**
   - Click "Pin Current Design"
   - Check if design appears in list
   - Check if comparison table has values

5. **Test Multi-Design**
   - Change volume, calculate, pin again
   - Check if both designs show in graphs
   - Check if both designs in comparison table

6. **Test Fork/Delete**
   - Click Fork on a design
   - Check if copy appears
   - Click Delete (×)
   - Check if removed

## Clear All Data

To start fresh:
```javascript
localStorage.clear()
location.reload()
```

## Report Issues

When reporting issues, include:
1. Browser (Safari/Chrome/Firefox)
2. Console errors (screenshot or text)
3. Debug panel output
4. Steps to reproduce
5. What you expected vs what happened
