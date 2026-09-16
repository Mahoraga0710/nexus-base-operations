# NEXUS Roadmap

## FOUNDATION / PHASE 0 (done + verified)
- [x] Authentication (register, login, logout, password reset, persistent session)
- [x] Database (users, clients, projects, tasks, comments, feedback, files, activity, notifications)
- [x] User roles (admin / employee / client, stored in user_roles, enforced by RLS)
- [x] Dashboard (name, email, role, account status, member since + real counts)
- [x] Client data isolation verified at database level (cross-client read returns 0 rows)

## AUTHORIZATION
- [ ] Admin tested
- [ ] Employee tested
- [ ] Client tested
- [ ] ID manipulation tested

## CLIENTS
- [ ] Create
- [ ] Read
- [ ] Update
- [ ] Delete
- [ ] Persistence

## PROJECTS
- [ ] Create
- [ ] Assign client
- [ ] Assign team
- [ ] Status
- [ ] Deadline
- [ ] Persistence

## TASKS
- [ ] CRUD
- [ ] Assignment
- [ ] Priority
- [ ] Deadline
- [ ] Kanban
- [ ] Dependencies
- [ ] Persistence

## ACTIVITY
- [ ] Events recorded
- [ ] Timeline
- [ ] Persistence

## CLIENT PORTAL
- [ ] Client login
- [ ] Own projects only
- [ ] Feedback
- [ ] Files
- [ ] Authorization tested

## AI
- [ ] Project summary
- [ ] Overdue analysis
- [ ] Blocker detection
- [ ] Recommendations

## AI REQUIREMENTS
- [ ] Parse requirements
- [ ] Generate tasks
- [ ] Validate output
- [ ] Review
- [ ] Approve
- [ ] Create tasks

## ENGINEERING
- [ ] Security audit
- [ ] Authorization audit
- [ ] Performance audit
- [ ] Error handling
- [ ] Input validation
- [ ] Code cleanup
- [ ] Mobile testing
- [ ] Final bug testing
