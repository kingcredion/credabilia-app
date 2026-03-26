# Select Elements & Mutation Audit

## Phase 1: Navigation Context Enhancement ✅

### Changes Made
- ✅ Browser back button now synced with NavigationContext
- ✅ Unified `goBack()` handler for both browser back and in-app back buttons
- ✅ Popstate event listener ensures history consistency
- ✅ Navigation flag prevents race conditions

### How It Works
1. Browser back button triggers `popstate` event
2. `handleBackButton` checks if we can go back in our stack
3. If yes, calls unified `goBack()` function
4. If no, allows browser default (navigates away)
5. NavigationContext direction signals UI animation

### Testing
- Test browser back button behavior
- Test in-app back button behavior
- Verify they trigger same animation/state

---

## Phase 2: Optimistic Updates Utilities ✅

### Created Functions

#### `createOptimisticHandlers()`
For general mutations with single query key

```javascript
const { onMutate, onError } = createOptimisticHandlers({
  queryKey: ['items'],
  updateFn: (data, mutationData) => ({ ...data, ...mutationData })
});

useMutation({
  mutationFn: api.updateItem,
  onMutate,
  onError,
  onSuccess: () => queryClient.invalidateQueries()
});
```

#### `createListOptimisticHandlers()`
For add/remove items from lists

```javascript
const { onMutate, onError } = createListOptimisticHandlers({
  queryKey: ['items'],
  mode: 'add', // or 'remove'
  getId: (item) => item.id
});
```

#### `createItemOptimisticHandlers()`
For single item mutations affecting list and detail views

```javascript
const { onMutate, onError } = createItemOptimisticHandlers({
  queryKey: ['item', itemId],
  listQueryKey: ['items'],
  getId: (item) => item.id
});
```

### Key Benefits
- ✅ Immediate UI feedback
- ✅ Automatic rollback on error
- ✅ Query cancellation prevents race conditions
- ✅ Consistent error handling

---

## Phase 3: Select Element Migration (TODO)

### Priority 1 - High Impact Selects

#### components/CategorySelector.jsx
- [ ] Replace `<Select>` with `MobileSelector`
- [ ] Audit mutation `onMutate/onError`

#### components/create-listing/Step1Signed.jsx
- [ ] Replace all `<Select>` elements with `MobileSelector`
- [ ] Add optimistic updates for category changes

#### pages/Marketplace.jsx
- [ ] Filter selects → MobileSelector
- [ ] Sort selects → MobileSelector
- [ ] Add optimistic state updates

#### pages/MyListings.jsx
- [ ] Status filter → MobileSelector
- [ ] Category filter → MobileSelector

### Priority 2 - Medium Impact Selects

#### components/settings/*
- [ ] Replace preference selects with MobileSelector
- [ ] Add optimistic theme/language updates

#### pages/Profile.jsx
- [ ] Role selector (if applicable)
- [ ] Preference selects

#### pages/AdminDashboard.jsx
- [ ] Filter/status selects
- [ ] Role assignment selects

### Priority 3 - Low Priority

#### Rarely-used selects
- [ ] Modal dialogs
- [ ] Feature flags
- [ ] Test utilities

---

## Phase 4: Mutation Handler Audit (TODO)

### Audit Checklist

For each mutation in the codebase:

```javascript
useMutation({
  mutationFn: api.updateItem,
  
  // ❓ Does this have onMutate?
  onMutate: async (variables) => {
    // Update UI immediately
    // Return context for rollback
  },
  
  // ❓ Does this have onError?
  onError: (error, variables, context) => {
    // Rollback UI
    // Show error toast
  },
  
  // ❓ Does this have onSuccess?
  onSuccess: (data, variables) => {
    // Invalidate related queries
    // Show success toast
  },
  
  // ❓ Does this have onSettled?
  onSettled: () => {
    // Cleanup
    // Disable loading state
  }
})
```

### Files to Audit

- [ ] pages/ItemDetails.jsx (vote, like, message mutations)
- [ ] pages/Profile.jsx (follow, edit profile mutations)
- [ ] pages/Marketplace.jsx (filter/sort state mutations)
- [ ] components/StripeCheckoutDialog.jsx (payment mutations)
- [ ] pages/MyListings.jsx (status, edit mutations)
- [ ] pages/Settings.jsx (preference mutations)
- [ ] components/create-listing/* (all mutations)

### Example Refactoring

**Before:**
```javascript
const mutation = useMutation({
  mutationFn: api.updateStatus,
  onSuccess: () => {
    queryClient.invalidateQueries();
  }
});
```

**After:**
```javascript
const { onMutate, onError } = createOptimisticHandlers({
  queryKey: ['items'],
  updateFn: (data, { status }) => ({ ...data, status })
});

const mutation = useMutation({
  mutationFn: api.updateStatus,
  onMutate,
  onError,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
    toast.success('Status updated');
  },
  onError: (error) => {
    toast.error('Failed to update status');
  }
});
```

---

## Mutation Patterns to Follow

### Pattern 1: Simple Update
```javascript
useMutation({
  mutationFn: api.updateItem,
  onMutate: async (newData) => {
    const previous = queryClient.getQueryData(['item']);
    queryClient.setQueryData(['item'], { ...previous, ...newData });
    return previous;
  },
  onError: (error, variables, previous) => {
    queryClient.setQueryData(['item'], previous);
  }
})
```

### Pattern 2: List Add/Remove
```javascript
useMutation({
  mutationFn: api.deleteItem,
  onMutate: async (itemId) => {
    const previous = queryClient.getQueryData(['items']);
    queryClient.setQueryData(['items'], 
      previous.filter(i => i.id !== itemId)
    );
    return previous;
  },
  onError: (error, variables, previous) => {
    queryClient.setQueryData(['items'], previous);
  }
})
```

### Pattern 3: Cascading Updates
```javascript
useMutation({
  mutationFn: api.updateItem,
  onMutate: async (updates) => {
    // Update single item
    const prevItem = queryClient.getQueryData(['item', itemId]);
    queryClient.setQueryData(['item', itemId], { ...prevItem, ...updates });
    
    // Update list
    const prevList = queryClient.getQueryData(['items']);
    queryClient.setQueryData(['items'],
      prevList.map(i => i.id === itemId ? { ...i, ...updates } : i)
    );
    
    return { prevItem, prevList };
  },
  onError: (error, variables, context) => {
    queryClient.setQueryData(['item', itemId], context.prevItem);
    queryClient.setQueryData(['items'], context.prevList);
  }
})
```

---

## Summary of Changes

| Category | Status | Impact |
|----------|--------|--------|
| NavigationContext | ✅ Done | Unified back button handling |
| Optimistic Utilities | ✅ Done | Reusable patterns for mutations |
| Select Migration | 📋 Planned | 15-20 select elements |
| Mutation Audit | 📋 Planned | 30-40 mutations |

## Next Steps

1. **Week 1**: Migrate high-priority select elements (Marketplace, MyListings)
2. **Week 2**: Audit and add optimistic updates to critical mutations
3. **Week 3**: Complete remaining select migrations
4. **Week 4**: Polish and testing

## Performance Impact

- ✅ Faster perceived performance (optimistic updates)
- ✅ Better mobile UX (native drawers vs tiny selects)
- ✅ Reduced network flicker (query cancellation)
- ✅ Better error resilience (automatic rollbacks)

## Success Metrics

- ✅ No native `<select>` or desktop-only `<Select>` elements
- ✅ All mutations include `onMutate/onError` handlers
- ✅ 100ms average response time for optimistic updates
- ✅ Zero broken navigation with browser back button