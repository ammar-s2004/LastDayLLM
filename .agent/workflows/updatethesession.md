---
description: Analyzes current session and incrementally updates 4 documentation files (schema report, updates log, reference manual, project tree). Only captures NEW/CHANGED content - no unnecessary rewrites. Maintains complete structure as project memory bank.
---

ROLE: Technical documentation agent for LastDayLLM project

PROJECT: LastDayLLM - AI exam preparation platform
STACK: Supabase PostgreSQL, Next.js, React, TypeScript, Google Gemini, Trigger.dev

OVERVIEW:
This workflow extracts NEW or CHANGED information from the conversation and incrementally updates four documentation files that serve as persistent context across development sessions. These files act as the project's memory bank.

TARGET FILES:
1. database_schema_report.md - Current DB state (update changed sections only)
2. project_updates.md - Session log (append new entry)
3. database_reference_manual.md - Technical reference (update changed sections)
4. project_tree.md - File/folder structure (update if new paths added)
5. tobedonenext.md - Priority tasks for the immediate future (update based on session outcome)

CORE PRINCIPLE: INCREMENTAL UPDATES
- Don't rewrite existing stable content
- Add new sections where needed
- Modify only changed sections
- Preserve full document structure
- Keep all existing content intact

This approach maintains complete, up-to-date knowledge base while avoiding unnecessary file bloat. All files reside in the `project_info/` directory.

---

STEP 1: IDENTIFY WHAT'S NEW OR CHANGED

Scan conversation for:

✅ NEW DATABASE ITEMS:
- New tables created
- New columns added to existing tables
- New RLS policies
- New functions/triggers
- New indexes

✅ MODIFIED DATABASE ITEMS:
- Altered table structures
- Modified RLS policies
- Updated function logic
- Changed triggers

✅ NEW CODE:
- New files created (with paths)
- New folders
- New API routes
- New components

✅ MODIFIED CODE:
- Files that were edited
- Functions that changed
- API endpoints modified

✅ OTHER CHANGES:
- Dependencies added/removed
- Environment variables
- Bugs fixed
- Features implemented

❌ IGNORE (DON'T DOCUMENT):
- General discussions
- Unchanged existing items
- Questions without implementation

---

STEP 2: UPDATE FILES

FILE 1: database_schema_report.md
ACTION: UPDATE changed sections + ADD new sections + KEEP unchanged content

```markdown
# Database Schema Report - LastDayLLM
**Last Updated:** [Update to current IST timestamp]
**Schema Version:** [Increment if changes made: 1.0 → 1.1]

***

## 📊 Overview
[UPDATE counts if changed]:
- **Total Tables:** [Update count]
- **RLS Policies:** [Update count]
- **Functions:** [Update count]
- **Triggers:** [Update count]
- **Last Modified:** [Update to current date]

***

## 📋 Tables

[KEEP ALL EXISTING TABLES]

[IF table modified, UPDATE that section]:
### `[existing_table_name]`
**Purpose:** [Keep existing]
**RLS Enabled:** [Update if changed]
**Last Modified:** [Update to current date]

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| [EXISTING columns - keep as-is] | ... | ... | ... | ... |
| [NEW columns - add these rows] | ... | ... | ... | ... |

**Indexes:**
[Keep existing]
- [Add new indexes if any]

**Foreign Keys:**
[Keep existing]
- [Add new FKs if any]

***

[IF new table created, ADD this section]:
### `[new_table_name]`
**Purpose:** [Description]
**RLS Enabled:** Yes/No
**Created:** [Current date]

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| [All columns] | ... | ... | ... | ... |

**Indexes:** [If any]
**Foreign Keys:** [If any]
**Related To:** [Relationships]

***

## 🔐 Row Level Security

[KEEP ALL EXISTING POLICIES]

[IF policy modified, UPDATE that section]
[IF new policy, ADD new section]:

### `[table_name]`
#### `[new_or_modified_policy_name]`
- **Applies To:** SELECT | INSERT | UPDATE | DELETE
- **Role:** [role]
- **USING:**
```sql
[SQL expression]
```
- **WITH CHECK:**
```sql
[SQL expression]
```
- **Last Updated:** [Current date]

***

## ⚙️ Functions

[KEEP ALL EXISTING FUNCTIONS]

[IF function modified, UPDATE that section]
[IF new function, ADD]:

### `[function_name]([params])`
**Returns:** [type]
**Purpose:** [What it does]
**Created/Modified:** [Date]

```sql
[Function code if relevant]
```

***

## 🔔 Triggers

[KEEP ALL EXISTING TRIGGERS]

[IF trigger modified, UPDATE]
[IF new trigger, ADD]:

### `[trigger_name]`
- **On Table:** `[table]`
- **Event:** [timing and action]
- **Executes:** `[function]()`
- **Created/Modified:** [Date]

***

## 🗺️ Relationship Map

[UPDATE this section only if relationships changed]
[Add new relationships, keep existing ones]

***

## 📝 Schema Notes
[KEEP existing notes]
[ADD new notes from this session]
```

---

FILE 2: project_updates.md
ACTION: PREPEND new session entry only (don't touch existing sessions)

```markdown
# Project Updates - LastDayLLM

***

## 🗓️ Session [Increment from last session number] - [Current Date IST]
**Focus:** [Main goal of THIS session only]

### 🔧 Changes Made This Session

#### 💾 Database
[ONLY list what changed in THIS session]:
- Created table: `[table_name]`
- Added column: `[column]` to `[table]`
- Modified policy: `[policy_name]`
- Created function: `[function_name]`

#### 🖥️ Backend
[ONLY changes from THIS session]:
- File: `path/to/file.ts` - [what changed]
- API: `/api/endpoint` - [modification]

#### 🎨 Frontend
[ONLY changes from THIS session]:
- Component: `ComponentName` - [change]
- Page: `/route` - [what done]

#### 🔌 Integrations
[ONLY from THIS session]:
- [Integration change]

### ✅ Completed This Session
- [Achievement 1]
- [Achievement 2]

### 🐛 Bugs Fixed
[ONLY bugs fixed THIS session]:
- **Issue:** [problem]
- **Solution:** [fix]

### 📦 Dependencies
[ONLY if dependencies changed THIS session]:
**Added:** [packages]
**Updated:** [packages]
**Removed:** [packages]

### 🧪 Testing
[What was tested THIS session]

### 🚀 Deployment
[Status from THIS session]

### 📋 Next Steps
[Tasks identified for NEXT session]:
- [ ] [Task 1]
- [ ] [Task 2]

### 💭 Notes
[Insights from THIS session]

***

[KEEP ALL PREVIOUS SESSIONS BELOW - DON'T MODIFY THEM]
```

---

FILE 3: database_reference_manual.md
ACTION: UPDATE only changed sections + ADD new sections + KEEP rest

```markdown
# Database Reference Manual - LastDayLLM
**Version:** [Increment: 1.0 → 1.1 if updates made]
**Last Updated:** [Current date IST]
**Database:** Supabase PostgreSQL

***

## 📚 Table Reference

[KEEP ALL EXISTING TABLE DOCS]

[IF table modified, UPDATE that table's section]:
### `[modified_table_name]`

**Purpose:** [Keep existing description unless it changed]
**Modified:** [Update to current date]

#### Schema
| Column | Type | Null | Default | Constraint | Description |
|--------|------|------|---------|------------|-------------|
| [KEEP existing columns] | ... | ... | ... | ... | ... |
| [ADD new columns as new rows] | ... | ... | ... | ... | ... |

[Keep existing subsections: Indexes, Constraints, RLS, etc.]
[ADD to them if new items, don't delete existing ones]

***

[IF new table created, ADD complete new section]:
### `[new_table_name]`

**Purpose:** [Detailed explanation]
**Created:** [Current date]

#### Schema
[Full table definition]

#### Indexes
[All indexes]

#### Row Level Security
[All policies]

#### Relationships
[All relationships]

#### Common Queries
```typescript
[Usage examples]
```

***

## 🔧 Functions & Procedures

[KEEP ALL EXISTING FUNCTION DOCS]

[IF function modified, UPDATE that section]
[IF new function, ADD complete section]:

### `[function_name]([params])`
**Modified/Created:** [Date]
[Full documentation]

***

## ⚡ Triggers

[KEEP ALL EXISTING TRIGGER DOCS]
[UPDATE modified triggers]
[ADD new triggers]

***

## 🔌 API Integration Patterns

[KEEP ALL EXISTING PATTERNS]
[ADD new patterns if discovered this session]

***

## 📊 Data Models

[KEEP EXISTING]
[ADD new models]
[UPDATE if business logic changed]

***

## ⚡ Performance

[KEEP EXISTING notes]
[ADD new optimization notes from this session]

***

## 🔄 Migration History

[KEEP ALL PREVIOUS MIGRATIONS]

[ADD new row if schema changed]:
| [v1.x] | [Current Date] | Schema | [What changed this session] | [Impact] |

***

## 📖 Appendix

[KEEP ALL EXISTING CONTENT]
[ADD new patterns/gotchas if discovered]
```

---

FILE 4: project_tree.md
ACTION: UPDATE structure ONLY if new files/folders added

```markdown
# Project Structure - LastDayLLM
**Last Updated:** [Update if structure changed]

***

## 📁 Directory Tree

```
lastdayllm/
│
├── [KEEP ALL EXISTING STRUCTURE]
│
├── [IF new folder created, ADD]:
├── new_folder/
│   ├── [new files inside]
│   └── [subdirectories]
│
├── [IF new file added to existing folder, ADD that file]:
├── existing_folder/
│   ├── [existing files - keep]
│   ├── new_file.ts           ← [ADD THIS]
│   └── [other existing files]
│
└── [KEEP rest of structure unchanged]
```

***

## 📄 Key Files

[KEEP ALL EXISTING FILE DESCRIPTIONS]

[IF new important file created, ADD]:
### `path/to/new_file.ts`
**Purpose:** [What this file does]
**Created:** [Date]
**Key Functions:** [Main exports/functions]
**Dependencies:** [What it imports]

***

## 🗂️ Folder Descriptions

[KEEP ALL EXISTING DESCRIPTIONS]

[IF new folder created, ADD]:
### `new_folder/`
**Purpose:** [What this folder contains]
**Contents:** [Brief overview]
**Related To:** [How it fits in project]

***

## 🔗 File Dependencies

[KEEP EXISTING DEPENDENCY MAP]

[IF new file with dependencies, ADD]:
- `new_file.ts`
  - Imports: `[dependencies]`
  - Used by: `[other files]`

***

## 📝 Structure Notes

[KEEP EXISTING NOTES]

[ADD new notes if structure decisions were made this session]:
- [Date]: [Note about why structure was organized this way]
```

---

FILE 5: tobedonenext.md
ACTION: UPDATE priority tasks based on session conclusions

```markdown
# To Be Done Next

## Priority [Number]: [Goal Name]
- **Problem**: [Short description of the challenge/gap]
- **Solution**:
    - [Step 1]
    - [Step 2]
- **Reference**: [Link to implementation plan or task.md section]

[KEEP existing priorities if not yet addressed]
[REMOVE or MOVE to project_updates.md if completed]
```

---

STEP 3: EXECUTION RULES

1. **Incremental Updates Only**
   - Don't rewrite stable content
   - Update changed sections
   - Add new sections
   - Keep everything else intact

2. **Precise Changes**
   - Use exact names from conversation
   - Update dates only where relevant
   - Increment version numbers appropriately

3. **Preserve Structure**
   - Maintain existing document organization
   - Keep all markdown headers
   - Preserve table formats

4. **Smart Detection**
   - If conversation just discusses existing code → NO UPDATE to tree/schema
   - If new file is created/mentioned → UPDATE tree
   - If schema is discussed but not changed → NO UPDATE to schema

5. **Session Entry**
   - project_updates.md always gets new session entry
   - Other files only updated if relevant changes occurred

6. **Version Increments**
   - Minor version bump (1.0 → 1.1) for additions
   - Major version bump (1.x → 2.0) for breaking changes
   - No version change if only project_updates.md modified

7. **Completeness**
   - Each file maintains its full structure
   - Never remove existing content
   - Build on top of what exists

8. **Timestamps**
   - Use IST format: "Monday, January 26, 2026, 2:42 PM IST"
   - Update "Last Updated" fields only in modified sections

9. **Skip Empty Updates**
   - If no database changes → Don't modify schema files unnecessarily
   - If no file structure changes → Don't modify tree
   - But always add session entry to project_updates.md

10. **Confirmation Output**
    ```
    ✅ Session [#] documented
    📝 Updated files in project_info/:
    - project_updates.md (new session entry)
    - database_schema_report.md (modified: [what changed])
    - database_reference_manual.md (added: [what new])
    - project_tree.md (updated: [new files/folders])
    - tobedonenext.md (updated: [next priority])
    ```

