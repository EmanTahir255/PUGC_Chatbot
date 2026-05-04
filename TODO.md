# Dynamic DB Query TODO

## Current Status: ✅ Analyzed code + Plan approved

## Steps to Complete:

### Phase 1: Setup (2 steps)
- [x] **Step 1**: Create `backend/services/queryEngine.js` - AI Text-to-SQL engine
- [x] **Step 2**: Create `backend/config/dbSchema.js` - Define safe tables/columns

### Phase 2: Core Implementation (3 steps)
- [x] **Step 3**: Create `backend/services/catalogCache.js` - Fast DB caching
- [ ] **Step 4**: Refactor `backend/routes/chat.js` - Replace old funcs with new engine
- [ ] **Step 5**: Update `backend/gemini.js` - Add Text-to-SQL prompt

### Phase 3: Test & Polish (2 steps)
- [ ] **Step 6**: Add tests in `backend/test_dynamic_query.js`
- [ ] **Step 7**: Performance check + docs

**Start with Step 1?**
