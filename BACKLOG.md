## Priority Order

### High Priority
1. **Automated weekly reminders** — Monday mornings, Irene reviews and sends; backend cron exists, needs schedule + review UI
2. **Create agreement flow (digital)** — manual data entry form, interest calculator, offer letter, payout schedule generation; replaces PDF-only path
3. **Role-based access control** — coordinator / accountant / salesperson see different views; needed before onboarding more users

### Medium Priority
4. **Dashboard segmentation** — Upcoming Payouts, Portfolio Health, Compliance Checklist sections; data already exists
5. **Google-based login** — Supabase already supports OAuth; mostly config + button

### Easy / Polish
6. **Sortable table headers** — investors table (name, PAN, principal, agreement count); pure frontend, no API/DB changes
7. **Sidebar collapse/expand** — pure UI, self-contained

### Low Priority / Future
8. **Slack integration** — automated notifications; adds external dependency
