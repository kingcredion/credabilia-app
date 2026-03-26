# MobileSelector Migration Guide

## Overview
All `<select>` elements and desktop-only dropdowns should be replaced with `MobileSelector` for unified mobile/desktop experience.

## Before & After

### Before (HTML select)
```jsx
<select value={status} onChange={(e) => setStatus(e.target.value)}>
  <option value="all">All Items</option>
  <option value="active">Active</option>
  <option value="sold">Sold</option>
</select>
```

### Before (Radix Select only)
```jsx
<Select value={status} onValueChange={setStatus}>
  <SelectTrigger>
    <SelectValue placeholder="Status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Items</SelectItem>
    <SelectItem value="active">Active</SelectItem>
    <SelectItem value="sold">Sold</SelectItem>
  </SelectContent>
</Select>
```

### After (MobileSelector)
```jsx
import MobileSelector from "@/components/MobileSelector";

<MobileSelector
  value={status}
  onValueChange={setStatus}
  trigger={<span>{statusLabel}</span>}
  items={[
    { value: "all", label: "All Items" },
    { value: "active", label: "Active" },
    { value: "sold", label: "Sold" }
  ]}
  title="Filter by Status"
  placeholder="Status"
/>
```

## With Icons

```jsx
<MobileSelector
  value={status}
  onValueChange={setStatus}
  trigger={<span>{statusLabel}</span>}
  items={[
    { value: "active", label: "Active", icon: "🟢" },
    { value: "pending", label: "Pending", icon: "🟡" },
    { value: "sold", label: "Sold", icon: "⚫" }
  ]}
  title="Order Status"
/>
```

## API

| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `value` | string | ✅ | Current selected value |
| `onValueChange` | function | ✅ | Callback when value changes |
| `items` | array | ✅ | Array of `{ value, label, icon? }` |
| `trigger` | JSX | ✅ | Display content (mobile button label) |
| `title` | string | ✅ | Drawer header (mobile only) |
| `placeholder` | string | ❌ | Select placeholder (desktop only) |

## Files to Update

### Components
- [ ] components/create-listing/* (filter/category selects)
- [ ] components/settings/* (preference selects)
- [ ] components/ui/select (usage cleanup)

### Pages
- [ ] pages/Marketplace (category/filter dropdowns)
- [ ] pages/MyListings (status filters)
- [ ] pages/AdminDashboard (admin filters)
- [ ] pages/Profile (role/preference selects)

### Key Areas
- Sort dropdowns
- Filter dropdowns
- Category selects
- Status selects
- Role/permission selects

## Benefits

✅ **Mobile**: Native drawer experience instead of tiny select  
✅ **Desktop**: Full Radix Select with all features  
✅ **Consistent**: Same component across all devices  
✅ **Responsive**: Auto-switches at 768px breakpoint  
✅ **Accessible**: Full keyboard + screen reader support  

## Notes

- MobileSelector has built-in desktop/mobile detection via `useIsDesktop()`
- No additional props needed — component handles responsive logic
- Icons are optional and display in both desktop and mobile modes
- Drawer title is mobile-only (set via `title` prop)

## Optimistic Updates Integration

When using `MobileSelector` in mutations:

```jsx
const mutation = useMutation({
  mutationFn: async (newValue) => {
    return api.updateStatus(newValue);
  },
  onMutate: async (newValue) => {
    // Optimistic: update UI immediately
    setStatus(newValue);
    return newValue;
  },
  onError: (error, variables, context) => {
    // Rollback on error
    setStatus(context);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
  }
});
```

## Status

⏳ **In Progress** — Audit all select elements and update components