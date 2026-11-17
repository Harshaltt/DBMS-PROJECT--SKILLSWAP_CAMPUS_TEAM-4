// Translates PostgreSQL errors into clear messages for the UI while keeping
// the SQLSTATE code and constraint name, so the demo can show that the rule
// was enforced by the DATABASE.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CONSTRAINT_MESSAGES = {
  chk_users_email_format: 'That e-mail address is not valid.',
  chk_users_name_not_blank: 'Please enter your full name (at least 2 characters).',
  chk_users_password_is_hash: 'Passwords must be stored as bcrypt hashes.',
  uq_users_email_lower: 'An account with this e-mail already exists.',
  users_email_key: 'An account with this e-mail already exists.',
  users_credits_balance_check: 'Credit balance cannot go below zero.',
  user_skills_user_id_skill_id_key: 'You already have this skill on your profile (you can either teach or learn a skill, not both).',
  sessions_offering_user_id_session_period_excl: 'The tutor already has a session that overlaps this time slot.',
  sessions_requesting_user_id_session_period_excl: 'You already have another session that overlaps this time slot.',
  sessions_check: 'You cannot book a session with yourself.',
  chk_session_duration_max: 'Sessions must last between 15 minutes and 4 hours.',
  chk_session_credits_max: 'A session can cost at most 100 credits.',
  resource_borrow_requests_resource_id_borrow_period_excl: 'This item is already lent out for overlapping dates.',
  resource_borrow_requests_check: 'The end date must be on or after the start date.',
  chk_borrow_max_30_days: 'Items can be borrowed for at most 30 days.',
  chk_resource_title_not_blank: 'The title must be at least 3 characters.',
  reviews_rating_check: 'Rating must be between 1 and 5.',
  reviews_session_id_reviewer_id_key: 'You have already reviewed this session.',
  reviews_check: 'You cannot review yourself.',
  chk_review_comment_length: 'Review comments are limited to 1000 characters.',
  categories_category_name_key: 'A category with this name already exists.',
  skills_skill_name_category_id_key: 'This skill already exists in that category.',
  skills_category_id_fkey: 'This category still has skills - delete or move them first (ON DELETE RESTRICT).',
  sessions_skill_id_fkey: 'This skill has session history and cannot be deleted (ON DELETE RESTRICT).',
};

const CODE_STATUS = {
  '23505': 409, // unique_violation
  '23P01': 409, // exclusion_violation
  '23503': 409, // foreign_key_violation
  '23514': 422, // check_violation (CHECK constraints + our triggers)
  '23502': 422, // not_null_violation
  '22P02': 400, // invalid_text_representation
  '22007': 400, // invalid_datetime_format
  '22008': 400, // datetime_field_overflow
  P0001: 422, // raise_exception
};

export function toErrorPayload(err) {
  if (err instanceof ApiError) return { status: err.status, body: { error: err.message } };
  if (err && typeof err.code === 'string' && err.code.length === 5) {
    const status = CODE_STATUS[err.code] || 400;
    const friendly = (err.constraint && CONSTRAINT_MESSAGES[err.constraint]) || err.message;
    return {
      status,
      body: { error: friendly, db: { code: err.code, constraint: err.constraint || null, detail: err.message } },
    };
  }
  console.error(err);
  return { status: 500, body: { error: 'Something went wrong on the server.' } };
}
