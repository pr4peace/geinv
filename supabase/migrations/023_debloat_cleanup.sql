-- Drop legacy notification and reminder tables
DROP TABLE IF EXISTS reminders;
DROP TABLE IF EXISTS notification_queue;
DROP TABLE IF EXISTS quarterly_reviews;

-- Remove unused columns from agreements if any (none identified as essential to remove yet)
