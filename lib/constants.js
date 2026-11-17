// Shared by the API and the UI.
export const CREDITS_PER_HOUR = 10; // 1 hour of tutoring = 10 campus credits
export const DURATIONS = [30, 45, 60, 90, 120];
export const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
export const priceFor = (minutes) => Math.round((minutes / 60) * CREDITS_PER_HOUR);
