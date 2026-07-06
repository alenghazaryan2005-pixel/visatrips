/**
 * Admin-defined application schema.
 *
 * Unified schema that holds both BUILT-IN sections/fields (wired into the
 * Playwright bot + gov submission) and admin-added CUSTOM ones. The
 * distinction is the `builtIn` flag — built-in entries have restricted edits
 * (can't change `key`/`type`/delete) but admins can still rename labels,
 * toggle required/hidden, reorder, and map them to the bot.
 *
 * Persistence: stored as a Setting key `application.schema.<COUNTRY>`.
 * On GET, the API merges stored overrides with the current code-defined
 * defaults so newly-added built-ins appear even for admins who saved
 * previously.
 */

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'number'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file';

/** Playwright action the bot runs on the gov form for this field. */
export type BotAction =
  | 'fill'    // type the value into an input
  | 'select'  // pick an option from a <select>
  | 'click'   // click an element (value tells us which one, e.g. "Yes"/"No")
  | 'check'   // set a checkbox to the value (boolean)
  | 'upload'  // upload a file at the value path (for file inputs)
  | 'skip';   // explicitly not automated — bot skips it

export interface CustomField {
  /** Unique key within its section. Camelcase. Stored on traveler. */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For select/radio, one option per line. */
  options?: string[];
  placeholder?: string;
  helpText?: string;
  /** If true, field is hidden from the customer form + admin detail view. */
  hidden?: boolean;
  /** Marks the field as seeded by the app (bot-wired). Admins can't delete or change key/type. */
  builtIn?: boolean;
  /** CSS selector on the gov site (e.g. `input#firstName`). Optional bot-mapping hint. */
  botSelector?: string;
  /** Playwright action the bot should perform. Defaults to `fill` for text-like fields. */
  botAction?: BotAction;
}

/** Which customer-facing page(s) a section appears on. */
export type SchemaPage = 'apply' | 'finish';

export interface CustomSection {
  /** Unique section key. */
  key: string;
  title: string;
  /**
   * Restrict the section to specific visa types. Undefined / missing /
   * empty array = visible for all visa types. Non-empty array = visible
   * ONLY for those visa codes (e.g. ['BUSINESS_1Y']).
   *
   * Used by:
   *   - the customer apply/finish forms (skip the section if not applicable)
   *   - the admin order detail (don't render fields a tourist will never have)
   *   - the bot script (don't try to fill fields that aren't on the form for
   *     this visa type)
   */
  visibleForVisaTypes?: string[];
  /**
   * Restrict the section to specific PurposeOfVisit values (the sub-purpose
   * the customer picks at apply Step 1, e.g. "Attend Technical/Business
   * Meetings", "Recruit Manpower"). Same semantics as visibleForVisaTypes:
   * empty/missing = visible for any purpose; non-empty = only those.
   *
   * Both filters are AND-combined — a section is visible only when BOTH
   * its visa-type and its purpose constraints (if any) pass.
   */
  visibleForPurposes?: string[];
  /**
   * Lucide icon name (e.g. "User", "Briefcase"). Admins pick these from a
   * curated gallery — see lib/sectionIcons for the full registry.
   * Takes precedence over `emoji` when rendering.
   */
  icon?: string;
  /**
   * Legacy emoji string (e.g. "📱"). Still supported for backward compat with
   * schemas saved before the icon picker existed.
   */
  emoji?: string;
  /** One-line description shown under the title. */
  description?: string;
  fields: CustomField[];
  /** If true, the entire section is hidden from the customer form + admin detail view. */
  hidden?: boolean;
  /** Marks the section as seeded by the app. Admins can't delete it. */
  builtIn?: boolean;
  /**
   * Which customer pages this section appears on. Controls editor filtering
   * + future schema-driven rendering on both apply + finish pages.
   * Default `['finish']` for backward compat with schemas saved before this
   * field existed.
   */
  pages?: SchemaPage[];
  /**
   * Bot hint: do NOT click "Next" after this section finishes. Used when
   * two schema sections live on the SAME gov-form page (e.g. Aruba folds
   * our customer-friendly `personal` + `address` sections into one
   * "Personal Information" panel). If true, the bot keeps filling
   * fields on the current page and only clicks Next at the boundary
   * of the next section that doesn't carry the flag. No effect on
   * the customer form — purely a bot pacing knob.
   */
  botSkipNext?: boolean;
  /**
   * Bot hint: pause BEFORE iterating this section's fields until a
   * human has manually advanced the gov form to the right page.
   *
   * Used when a gov-form step requires human inspection — e.g.
   * Aruba's Review accordion sits between Contact and Payment.
   * Set on the section that comes AFTER the human-step (in our
   * Aruba case, `payment`): the bot polls for the section's first
   * field to be visible, prints a "click Next on review when ready"
   * message, and proceeds once the human has advanced.
   *
   * Doesn't change customer-side behavior — purely a bot pacing knob.
   */
  botWaitForHuman?: boolean;
}

export interface ApplicationSchema {
  /** Country code, upper-case. */
  country: string;
  /** All sections — built-in + custom, in render order. */
  sections: CustomSection[];
  /**
   * Keys of built-in entries the admin has explicitly deleted.
   *
   * Built-in sections + fields normally get reinjected by `mergeWithDefaults`
   * even after admin removes them, because the defaults live in code and the
   * merge preserves them as a safety net. This array is the override: if a
   * built-in's key appears here, the merge skips it.
   *
   * Encoding: section keys for whole-section deletes, `${sectionKey}.${fieldKey}`
   * for field-level deletes. e.g. `["accommodation", "passport.otherPassportNumber"]`
   *
   * Admins can recover a deleted built-in by removing its entry from this
   * list (currently only via DB edit; a "Restore defaults" button can come
   * later if needed).
   */
  deletedBuiltIns?: string[];
  updatedAt?: string;
}

/**
 * Field keys that vary PER TRAVELER on gov forms. Everything else
 * (trip dates, address, contact, payment) is shared at the ORDER
 * level — collected once for traveler 0 and re-used for every extra
 * traveler.
 *
 * Used in three places, all consuming the same single source:
 *   - `/apply/finish` extra-traveler cards (SchemaDrivenFinish.tsx)
 *   - Admin Full Edit per-traveler view (admin/orders/[id]/page.tsx)
 *   - The bot's per-traveler "Add Family Member" loop (process-aruba.ts)
 *
 * Add a key here when a new per-traveler field needs to flow through
 * all three layers consistently.
 */
export const PER_TRAVELER_FIELD_KEYS = [
  'passportFile',
  'countryOfBirth',
  'firstName',
  'lastName',
  'dob',
  'gender',
  'nationality',
  'passportNumber',
  'passportExpiryDate',
  'occupation',
  'dualCitizenship',
] as const;
export type PerTravelerFieldKey = typeof PER_TRAVELER_FIELD_KEYS[number];

export function schemaSettingKey(country: string): string {
  return `application.schema.${country.toUpperCase()}`;
}

/** Field types shown in the admin UI dropdown. */
export const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string; hint: string }> = [
  { value: 'text',     label: 'Short text',    hint: 'Single-line input' },
  { value: 'textarea', label: 'Long text',     hint: 'Multi-line input' },
  { value: 'email',    label: 'Email',         hint: 'Validates email format' },
  { value: 'tel',      label: 'Phone',         hint: 'Phone number' },
  { value: 'date',     label: 'Date',          hint: 'Date picker' },
  { value: 'number',   label: 'Number',        hint: 'Numeric only' },
  { value: 'select',   label: 'Dropdown',      hint: 'Pick one from options' },
  { value: 'radio',    label: 'Radio buttons', hint: 'Pick one (visible options)' },
  { value: 'checkbox', label: 'Checkbox',      hint: 'On/off toggle' },
  { value: 'file',     label: 'File upload',   hint: 'Customer uploads an image or document. Stored via /api/upload.' },
];

export const BOT_ACTION_OPTIONS: Array<{ value: BotAction; label: string; hint: string }> = [
  { value: 'fill',   label: 'Fill (type text)',     hint: 'Best for text inputs, emails, dates' },
  { value: 'select', label: 'Select (dropdown)',    hint: 'Pick the matching <option>' },
  { value: 'click',  label: 'Click (yes/no, radio)', hint: 'Clicks a specific option based on the value' },
  { value: 'check',  label: 'Check (checkbox)',     hint: 'Sets a checkbox to the boolean value' },
  { value: 'upload', label: 'Upload (file input)',  hint: 'Uploads a file at the value path' },
  { value: 'skip',   label: 'Skip (do nothing)',    hint: 'Bot ignores this field' },
];

/**
 * BUILT-IN INDIA FORM
 *
 * Every field here is wired into the Playwright bot (scripts/process-visa.ts)
 * and the gov submission payload. Admins CANNOT remove these or change their
 * key/type — but they can rename labels, toggle required/hidden, and
 * adjust bot selectors when the gov site changes.
 *
 * Ordering and grouping here IS the default render order across the finish
 * page + admin detail view.
 */
export const BUILT_IN_INDIA_SECTIONS: CustomSection[] = [
  // ── Apply page only ──
  // Visa selection lives at Step 1 of /apply. These fields drive the
  // order itself (destination, visaType, travelers, purposeOfVisit) rather
  // than traveler data, so they don't appear on the finish page.
  {
    key: 'visa_selection', title: 'Visa Selection', icon: 'Sparkles', builtIn: true,
    pages: ['apply'],
    description: 'Initial visa choice on Step 1 of the application.',
    fields: [
      { key: 'passportCountry', label: 'Passport country',  type: 'text',   required: true, builtIn: true, helpText: "Customer's passport of origin" },
      { key: 'visaType',        label: 'Visa type',         type: 'select', required: true, builtIn: true, options: ['TOURIST_30','TOURIST_1Y','TOURIST_5Y','BUSINESS_1Y','MEDICAL_60'] },
      { key: 'travelers',       label: 'Number of travelers', type: 'number', required: true, builtIn: true },
      { key: 'purposeOfVisit',  label: 'Purpose of visit',  type: 'select', builtIn: true, options: ['Tourism','Visit family/friends','Medical treatment','Business meetings','Attending conference'] },
    ],
  },
  // ── Traveler sections below: appear on both /apply (Step 2/2b) and /finish ──
  {
    key: 'personal', title: 'Personal', icon: 'User', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'firstName',     label: 'First name',     type: 'text', required: true, builtIn: true },
      { key: 'lastName',      label: 'Last name',      type: 'text', required: true, builtIn: true },
      { key: 'email',         label: 'Email',          type: 'email', required: true, builtIn: true },
      { key: 'dob',           label: 'Date of birth',  type: 'date', required: true, builtIn: true },
      { key: 'gender',        label: 'Gender',         type: 'select', required: true, builtIn: true, options: ['Male', 'Female', 'Other'] },
      { key: 'maritalStatus', label: 'Marital status', type: 'select', required: true, builtIn: true, options: ['Single', 'Married', 'Divorced', 'Widowed'] },
    ],
  },
  {
    key: 'birth_identity', title: 'Birth & Identity', icon: 'IdCard', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'countryOfBirth',          label: 'Country of birth',          type: 'text', required: true, builtIn: true },
      { key: 'cityOfBirth',             label: 'City of birth',             type: 'text', required: true, builtIn: true },
      { key: 'religion',                label: 'Religion',                  type: 'text', builtIn: true },
      { key: 'citizenshipId',           label: 'Citizenship / National ID', type: 'text', builtIn: true },
      { key: 'educationalQualification', label: 'Educational qualification', type: 'text', builtIn: true },
      { key: 'visibleMarks',            label: 'Visible identification marks', type: 'text', builtIn: true },
    ],
  },
  {
    key: 'address', title: 'Home Address', icon: 'Home', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'address',          label: 'Street address',  type: 'text', required: true, builtIn: true },
      { key: 'city',             label: 'City',            type: 'text', required: true, builtIn: true },
      { key: 'state',            label: 'State / Province', type: 'text', required: true, builtIn: true },
      { key: 'zip',              label: 'Zip / Postal code', type: 'text', required: true, builtIn: true },
      { key: 'phoneNumber',      label: 'Phone number',    type: 'tel', required: true, builtIn: true },
      { key: 'residenceCountry', label: 'Country of residence', type: 'text', required: true, builtIn: true },
    ],
  },
  {
    key: 'employment', title: 'Employment', icon: 'Briefcase', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'employmentStatus', label: 'Employment status', type: 'select', required: true, builtIn: true, options: ['Employed', 'Self-employed', 'Student', 'Retired', 'Unemployed', 'Housewife'] },
      { key: 'employerName',     label: 'Employer name',     type: 'text', builtIn: true },
      { key: 'employerAddress',  label: 'Employer address',  type: 'text', builtIn: true },
      { key: 'employerCity',     label: 'Employer city',     type: 'text', builtIn: true },
      { key: 'employerState',    label: 'Employer state',    type: 'text', builtIn: true },
      { key: 'employerCountry',  label: 'Employer country',  type: 'text', builtIn: true },
      { key: 'employerZip',      label: 'Employer zip',      type: 'text', builtIn: true },
      { key: 'studentProvider',  label: 'School / Institution (students)', type: 'text', builtIn: true },
      { key: 'servedMilitary',   label: 'Served in military?', type: 'radio', builtIn: true, options: ['yes', 'no'] },
    ],
  },
  {
    // Business-visa "Attend Technical/Business Meetings" section. Each of
    // the 10 business sub-purposes has a slightly different gov-form layout —
    // Industrial/Business Venture adds a "Nature of Business/Product" field,
    // Recruitment swaps in different fields, etc. We model each sub-purpose
    // as its own section and filter by both visa type AND sub-purpose so
    // exactly the right fields render.
    //
    // This entry covers ONLY "Attend Technical/Business Meetings". More
    // sub-purpose sections will be added as we map out the gov form.
    key: 'business_meetings_details', title: 'Business Meeting Details', icon: 'Building2', builtIn: true,
    pages: ['finish'],
    visibleForVisaTypes: ['BUSINESS_1Y'],
    visibleForPurposes: ['Attend Technical/Business Meetings'],
    description: 'Required for business meeting visas — your company + the Indian firm you\'re meeting with.',
    fields: [
      { key: 'applicantCompanyName',    label: "Applicant's company name",      type: 'text', required: true, builtIn: true, helpText: "Your employer / the company sending you to India." },
      { key: 'applicantCompanyAddress', label: "Applicant's company address",   type: 'text', required: true, builtIn: true },
      { key: 'applicantCompanyPhone',   label: "Applicant's company phone",     type: 'text', required: true, builtIn: true },
      { key: 'applicantCompanyWebsite', label: "Applicant's company website",   type: 'text', required: true, builtIn: true },
      { key: 'indianFirmName',          label: 'Indian firm name',              type: 'text', required: true, builtIn: true, helpText: 'The Indian company you are visiting / meeting with.' },
      { key: 'indianFirmAddress',       label: 'Indian firm address',           type: 'text', required: true, builtIn: true },
      { key: 'indianFirmPhone',         label: 'Indian firm phone',             type: 'text', required: true, builtIn: true },
      { key: 'indianFirmWebsite',       label: 'Indian firm website',           type: 'text', required: true, builtIn: true },
    ],
  },
  {
    key: 'family', title: 'Family', icon: 'Users', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'knowParents',          label: 'Do you know your parents?', type: 'radio', builtIn: true, options: ['yes', 'no'] },
      { key: 'fatherName',           label: "Father's name",             type: 'text', builtIn: true },
      { key: 'fatherNationality',    label: "Father's nationality",      type: 'text', builtIn: true },
      { key: 'fatherPlaceOfBirth',   label: "Father's place of birth",   type: 'text', builtIn: true },
      { key: 'fatherCountryOfBirth', label: "Father's country of birth", type: 'text', builtIn: true },
      { key: 'motherName',           label: "Mother's name",             type: 'text', builtIn: true },
      { key: 'motherNationality',    label: "Mother's nationality",      type: 'text', builtIn: true },
      { key: 'motherPlaceOfBirth',   label: "Mother's place of birth",   type: 'text', builtIn: true },
      { key: 'motherCountryOfBirth', label: "Mother's country of birth", type: 'text', builtIn: true },
      { key: 'spouseName',           label: "Spouse's name",             type: 'text', builtIn: true },
      { key: 'spouseNationality',    label: "Spouse's nationality",      type: 'text', builtIn: true },
      { key: 'parentsFromPakistan',  label: 'Parents from Pakistan?',    type: 'radio', builtIn: true, options: ['yes', 'no'] },
    ],
  },
  {
    key: 'passport', title: 'Passport', icon: 'BookOpen', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'passportCountry',         label: 'Issuing country',  type: 'text', required: true, builtIn: true },
      { key: 'passportNumber',          label: 'Passport number',  type: 'text', required: true, builtIn: true },
      { key: 'passportPlaceOfIssue',    label: 'Place of issue',   type: 'text', required: true, builtIn: true },
      { key: 'passportCountryOfIssue',  label: 'Country of issue', type: 'text', required: true, builtIn: true },
      { key: 'passportIssued',          label: 'Date of issue',    type: 'date', required: true, builtIn: true },
      { key: 'passportExpiry',          label: 'Expiration date',  type: 'date', required: true, builtIn: true },
      { key: 'hasOtherPassport',        label: 'Hold any other passport?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'otherPassportNumber',     label: 'Other passport number', type: 'text', builtIn: true },
      { key: 'otherPassportDateOfIssue', label: 'Other passport date of issue', type: 'date', builtIn: true },
      { key: 'otherPassportPlaceOfIssue', label: 'Other passport place of issue', type: 'text', builtIn: true },
    ],
  },
  {
    key: 'nationality', title: 'Nationality', icon: 'Globe', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'nationalityByBirth',    label: 'Nationality at birth',     type: 'text', builtIn: true },
      { key: 'holdAnotherNationality', label: 'Hold another nationality?', type: 'radio', builtIn: true, options: ['yes', 'no'] },
      { key: 'otherNationality',      label: 'Other nationality',        type: 'text', builtIn: true },
      { key: 'livedTwoYears',         label: 'Lived here 2+ years?',     type: 'radio', builtIn: true, options: ['yes', 'no'] },
    ],
  },
  {
    key: 'trip', title: 'Trip', icon: 'Plane', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'arrivalDate',        label: 'Arrival date',         type: 'text', required: true, builtIn: true },
      { key: 'arrivalPoint',       label: 'Port of arrival',      type: 'text', required: true, builtIn: true },
      { key: 'exitPort',           label: 'Port of departure',    type: 'text', required: true, builtIn: true },
      { key: 'placesToVisit',      label: 'Places you plan to visit', type: 'textarea', required: true, builtIn: true },
      { key: 'visitedIndiaBefore', label: 'Visited India before?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'visaRefusedBefore',  label: 'Any visa refused before?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'hasConfirmedTravel', label: 'Confirmed travel dates?', type: 'radio', builtIn: true, options: ['yes', 'no'] },
      { key: 'visitedCountries',   label: 'Countries visited in last 10 years', type: 'textarea', builtIn: true },
    ],
  },
  {
    key: 'accommodation', title: 'Accommodation', icon: 'Hotel', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'bookedHotel',         label: 'Booked hotel?',          type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'hotelName',           label: 'Hotel name',             type: 'text', builtIn: true },
      { key: 'hotelPlace',          label: 'Hotel address / place',  type: 'text', builtIn: true },
      { key: 'tourOperatorName',    label: 'Tour operator name',     type: 'text', builtIn: true },
      { key: 'tourOperatorAddress', label: 'Tour operator address',  type: 'text', builtIn: true },
    ],
  },
  {
    key: 'references', title: 'References', icon: 'Contact', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'refNameIndia',     label: 'Reference name in India',    type: 'text', required: true, builtIn: true },
      { key: 'refAddressIndia',  label: 'Reference address in India', type: 'text', required: true, builtIn: true },
      { key: 'refStateIndia',    label: 'Reference state in India',   type: 'text', required: true, builtIn: true },
      { key: 'refDistrictIndia', label: 'Reference district in India', type: 'text', builtIn: true },
      { key: 'refPhoneIndia',    label: 'Reference phone in India',   type: 'tel', required: true, builtIn: true },
      { key: 'refNameHome',      label: 'Reference name (home country)',    type: 'text', required: true, builtIn: true },
      { key: 'refAddressHome',   label: 'Reference address (home country)', type: 'text', required: true, builtIn: true },
      { key: 'refStateHome',     label: 'Reference state (home country)',   type: 'text', required: true, builtIn: true },
      { key: 'refDistrictHome',  label: 'Reference district (home country)', type: 'text', builtIn: true },
      { key: 'refPhoneHome',     label: 'Reference phone (home country)',   type: 'tel', required: true, builtIn: true },
    ],
  },
  {
    key: 'security', title: 'Security', icon: 'Shield', builtIn: true,
    pages: ['apply', 'finish'],
    fields: [
      { key: 'hasCriminalRecord', label: 'Any criminal record?', type: 'radio', builtIn: true, options: ['yes', 'no'] },
      { key: 'everArrested',      label: 'Ever arrested, prosecuted, or convicted?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'everRefusedEntry',  label: 'Ever refused entry or deported?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
      { key: 'soughtAsylum',      label: 'Ever sought asylum?', type: 'radio', required: true, builtIn: true, options: ['yes', 'no'] },
    ],
  },
  {
    key: 'documents', title: 'Documents', icon: 'FileText', builtIn: true,
    pages: ['finish'],
    fields: [
      { key: 'photoUrl',        label: 'Passport-style photo', type: 'text', required: true, builtIn: true, helpText: 'File upload — admin cannot change the type to anything else.' },
      { key: 'passportBioUrl',  label: 'Passport bio page',    type: 'text', required: true, builtIn: true, helpText: 'File upload — admin cannot change the type.' },
    ],
  },
];

/**
 * BUILT-IN ARUBA ED CARD FORM
 *
 * Eight sections matching the published Aruba Online ED Card flow.
 * Customer-facing — rendered by app/apply/finish/SchemaDrivenFinish.tsx
 * for any order whose destination is Aruba.
 *
 * Implementation notes:
 *   - "Add Family Member" multi-traveler isn't supported by the current
 *     renderer (single-traveler only). For now, multiple travelers means
 *     multiple orders. Multi-traveler is a future enhancement.
 *   - "State populated based on country" (Personal Info) and "Flight
 *     Number populated based on airline" (Arrival/Departure) require
 *     cross-field reactivity the schema engine doesn't have yet. Both
 *     are rendered as text inputs so customers can type them; we'll add
 *     conditional dropdowns when we tackle the schema editor refactor.
 *   - Country lists, airline list, and occupation list use the
 *     constants below to keep this file scannable.
 */

const ARUBA_FULL_COUNTRY_LIST = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
  'Canada','Cape Verde','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica',
  "Côte d'Ivoire",'Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador',
  'Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France',
  'Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland',
  'Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
  'Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar',
  'Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia',
  'Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal',
  'Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan',
  'Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar',
  'Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Saudi Arabia','Senegal',
  'Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea',
  'South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan',
  'Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu',
  'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela',
  'Vietnam','Yemen','Zambia','Zimbabwe',
];

// Mirrors the airlines + flight-type options actually offered in
// Aruba's Departure Details dropdown (verified May 2026 — screenshot).
// Order matches the gov form so customer + bot pick from the same
// list. The lower block (Ambulance → Private) is the flight-type
// fallback the form switches to when a private/non-commercial flight
// is selected.
const ARUBA_AIRLINES = [
  'Air Century','American Airlines','Arajet','Avianca','Copa Airlines','Delta Airlines',
  'Divi Divi Air','EZ Air','GOL','JetBlue','KLM Royal Dutch Airlines','LATAM Airlines Peru',
  'Southwest Airlines','Spirit Airlines','Surinam Airways','United Airlines',
  'WestJet Airlines','WinAir','Wingo',
  'Ambulance','Cargo','Charter','Diplomatic','Military','Others','Private',
];

const ARUBA_OCCUPATIONS = [
  'Doctor / Physician','Engineer / Architect','Computer analyst / Software developer','Manager / Supervisor',
  'Bank / Financial / Accounting executive','Marketing / Advertising / PR executive','Lawyer / Legal',
  'Teacher / Academic','Nurse / Therapist / Healthcare','Technical','Business owner','Pilot / Flight attendant',
  'Police / Customs / Immigration / Military','Blue collar','Professional occupation','Government',
  'Tourism related','Student','Retired','Other','CBP Official',
];

// Note: purpose-of-visit options for Aruba live in lib/countryConfig.ts
// (`ARUBA.purposeOptions`) so customers pick them on the apply page,
// matching India's flow. Don't duplicate them here.

const ARUBA_PRIOR_VISITS = ['First','2-5','6-9','10-14','15-19','20+'];
const ARUBA_BOOKING_METHOD = ['Travel agent','Airline / hotel','Other website'];
const ARUBA_HEARD_ABOUT   = ['Media ad','Article','www.Aruba.com','Direct mail','Cruise','Internet','Travel agent','Family / Friends','Other'];
const ARUBA_WHY_PICK      = ['Points redemption / Loyalty Program','Adventure activities','Direct flights','Ease / comfort','Family friendly','Outside hurricane belt','Reliable weather','Familiarity','Word of mouth','Other'];
const ARUBA_PLACE_OF_STAY = ['Hotel','Timeshare','Airbnb','Stay at friends & family','Own'];

/**
 * Aruba's "Name of Place of Stay" dropdown — the specific hotel /
 * apartment / property the traveller is staying at. Only renders
 * on the gov form AFTER the customer picks `placeOfStay = Hotel`
 * (or one of the other categories that maps to this list).
 *
 * Source: official edcardaruba.aw dropdown, transcribed May 2026.
 * Add new entries when Aruba updates the list; the option order
 * mirrors the gov form's alphabetical order so customers see what
 * they see on the official site.
 */
const ARUBA_PLACE_OF_STAY_NAMES = [
  'BONBINI APARTMENT',
  '7 SHADES OF BLUE (SPAANS LAGOENWEG 17)',
  'A-1 APARTMENTS (PAGAAISTRAAT 5)',
  'AGUA CLARA ECO SUITES (MORGENSTER 50A)',
  'ALAMANDA APTS (MONT PELESTR. 6)',
  'ALOE WOOD GARDENS (MONTANA)',
  'ALTA MONTANA APT. (ALTO VISTA 42-A)',
  'AMERICAN BAR',
  'AMSTERDAM MANOR BEACH RESORT',
  'ANACONDA BAR',
  'ARASHI BEACH VILLA',
  'ARASHI VILLA REAL EST.',
  'ARUBA APARTMENT , VENEZUELASTRAAT 7',
  'ARUBA BEACH CHALETS (SAVANETA 3)',
  'ARUBA BEACH CLUB',
  'ARUBA BEACH VILLAS',
  'ARUBA BLUE VILLAGE',
  'ARUBA BOUTIQUE & ART HOTEL',
  'ARUBA BOUTIQUE APARTMENTS , CALBAS 3-G',
  'ARUBA BREEZE CONDOMINIUM (BLVD 232 A)',
  'ARUBA DREAM VILLA',
  'ARUBA HARMONY APT.',
  'ARUBA MARRIOTT RESORT & STELLARIS CASINO',
  'ARUBA OCEAN VILLAS',
  'ARUBA PALM VILLA',
  'ARUBA PEARL CONDO (JE IRAUSQUIN BLVD 232A)',
  'ARUBA RACQUET CLUB',
  'ARUBA REEF APTS. (SAVANETA 342C)',
  'ARUBA RESORT',
  'ARUBA SOL APARTMENTS',
  'ARUBA SUNSET BEACH STUDIOS (LG SMITH BLVD 486)',
  'ARUBA SURFSIDE MARINA (LG SMITH BLVD 7)',
  'ARUBA TROPIC APTS (TANKI LEENDERT 251E)',
  'ARUBA VACATION PARK',
  'ARUBA VILLAS RENTAL (SALINJA SERCA 35E)',
  'ARUBA WALKING APARTMENTS',
  "ARUBA'S LIFE VACATION RESIDENCES",
  'ARUBIANA INN',
  'ASPID APPARTMENTS (GEORGE MADURO STR. 7)',
  'ASTORIA HOTEL',
  'AZURE RESIDENT',
  'BANANAS APARTMENTS (MALMOKWEG 19)',
  'BARANCA',
  'BARCELO ARUBA',
  'BEACH HOUSE AUA APARTMENTS, LG SMITH BLVD 450',
  'BEACH HOUSE VILLAS',
  'BELL BLUE APARTMENTS',
  'BLACK AND WHITE',
  'BLOEMOND VILLA',
  'BLUE RESIDENCES',
  'BOARDWALK HOTEL ARUBA',
  'BONA VISTA PARK ARUBA',
  'BONGO BAR',
  'BORINQUEN BAR',
  'BRISAS APARTMENTS',
  'BUBALI BLISS STUDIOS',
  'BUBALI F APARTMENTS',
  'BUBALI LODGE',
  'BUBALI LUXURY APARTMENTS',
  'BUBALI VACATION VILLA',
  'BUBALI VILLA',
  'BUBALI VILLA CEVIS REAL ESTATE',
  'BUBALI VILLA PARK',
  'BUCUTI BEACH RESORT',
  'BUCUTI GUEST HOUSE (BUCUTIWEG 9)',
  'BUENA VISA GUESTHOUSE',
  "BUFAM'S TROPICAL HAVEN (POS ABOU 34)",
  'CADUSHI APARTMENT',
  'CALABAS PROPERTIES NV (JE IRAUSQUIN BLVD 79)',
  'CALIFORNIA HOTEL',
  'CAMACURI APPARTMENT',
  'CARACAS BAR 2',
  'CARIBBEAN BAR',
  'CARIBBEAN PALM VILLAGE RESORT',
  'CARINAS BUNGALOW AND STUDIO APTS (PALM BEACH 360)',
  'CAROLINA BAR',
  'CAS KENEPA VAC. HOUSE',
  'CASA DEL MAR',
  'CASIBARI GUEST HOUSE',
  'CASIBARI VILLA',
  'CATALEYA ARUBA VACATION APARTMENTS',
  'CATIRI APARTMENTS',
  'CHALET SAVANETA',
  'CHESTERFIELD BAR',
  'CHINA CLIPPER',
  'CLUB ARIAS (SAVANETA 123K)',
  'CLUB MONACO II',
  'COCONUT INN',
  'COMDOMINIO VILLAS DEL MAR',
  'COMFORT INN',
  'CONDOMINIUM OCEANA',
  'COPACABANA',
  'CORAL PIRAMIDE CONDOS (LG SMITH BLVD)',
  'CORAL REEF BEACH',
  'COSTA ESMERALDA',
  'COSTA LINDA BEACH',
  'COURTESY RENT A CAR AND APTS (SEROE BLANCO 29)',
  'COURTYARD BY MARRIOTT ARUBA RESORT',
  'CRYSTAL APARTMENT',
  'CRYSTAL BEACH VILLAS',
  'CUNUCU ARUBIANO',
  'CUNUCU VILLAS (SANTA CRUZ 63)',
  'DE CUBA BED $ BREAKFAST',
  'DEL REY APARTMENTS',
  'DESSERT IN APARTMENT',
  'DIVI ARUBA ALL INCLUSIVE BEACH RESORT',
  'DIVI ARUBA PHOENIX BEACH RESORT',
  'DIVI LINKS',
  'DIVI VILLAGE GOLF & BEACH RESORT',
  'DIVI-DORAL ARUBA HOTELS',
  'DONA CLARA APARTMENTS',
  'DORADO EAGLE BEACH HOTEL',
  'DUTCH VILLAGE BEACH RESORT',
  'E SOLO APTMS (SCHOTLANDSTRAAT 48)',
  'EAGLE ARUBA RESORT & CASINO',
  'EAGLE BEACH APARTMENTS',
  'EAGLE BEACH STUDIOS (JE IRAUQUIN BLVD 228F)',
  'EL OLIMPICO HOTEL',
  'ELEMENTS OF ARUBA',
  'EMBASSY SUITES BY HILTON',
  'FANTASY BAR',
  'FISHERMANS HUTS',
  'FLAMBOYANT GARDEN VILLAS (BEATRIXSTR. 12)',
  'FRAN-GER EXECUTIVE APARTMENTS N.V.',
  'GOLD COAST',
  'GOLDEN VILLAS',
  'GRAY DOOR APARTMENTS (NOORD 164)',
  'GUADALAJARA BAR',
  'HADICURARI BEACH HOUSE',
  'HARMONY APARTMENTS',
  'HIDDEN EDEN APTS (BUSHIRI 12)',
  'HILTON',
  'HOLIDAY INN HOTEL',
  'HOMEY VAC ARUBA APARTMENT',
  'HOOIBERG GUST HOUSE',
  'HOTEL BACCARA',
  "HOTEL ROY'S",
  'HOUSE OF MOSAIC AUA',
  'HYATT PLACE AIRPORT',
  'HYATT REGENCY ARUBA RESORT & CASINO',
  'ISLA BONITA RESIDENCE',
  'JARDIN JUNIOR BAR',
  'JARDINES DE CARIBE',
  'JARDINES DEL MAR CONDOS (EAGLE BEACH)',
  'JAVA BAR',
  'JOIA ARUBA BY IBEROSTAR',
  'JUANEDU SUITS',
  'KAMERLINGH VILLA (KAMERINGH ONNESTRAAT 50)',
  'KARIBU APPTS (SALINJA SERCA 25M)',
  'KING DAVID SUITES/APTM. (PALM BEACH 200)',
  'KITE-INN',
  'KUDAWECHA APTS (KUDAWECHA 40)',
  'LA BOHEME APTS ARUBA (BAKVAL 2E)',
  'LA CABANA BEACH RESORT & CASINO',
  'LA DOLCE VITA APARTMENT',
  'LA MAISON',
  'LA QUINTA',
  'LADYBUG APARTMENTS',
  'LAGUNA BEACH APARTMENT (SPAANS LAGOENWEG 6)',
  'LANDSLAKE APTS ARUBA (NOORD)',
  'LAS VEGAS BAR',
  'LATIEFA APTS (DAKOTA)',
  'LE CHATEAU OCEAN VILLA',
  'LEVENT BEACH RESORT ARUBA',
  'LEVENT CONDOMINIO',
  'LITTLE DAVID GUEST HOUSE (SEROE BLANCO 56L)',
  'LITTLE PARADISE ARUBA VACATION APTS (MATADERA 3E)',
  "LUCITTA'S APARTMENTS N.V.",
  'MALIBU HOTEL/APTS (STADIONWEG 19)',
  'MALMOK BEACH HOUSE',
  'MALMOK SUR-MER VILLA',
  'MALMOK VILLA',
  'MANCHEBO BEACH RESORT& SPA',
  'MAR I SOL',
  'MARCHENA BAR',
  'MARINIERS KAZERNE',
  'MARRIOTT SURF CLUB',
  "MARRIOTT'S ARUBA OCEAN CLUB",
  'MERLOT VILLAS (SALINJA SERCA 47)',
  'MI CIELO APARTMENTS',
  'MI PILAR APARTMENTS (CANTALOUPSTRAAT 24)',
  'MILLENIUM RESORT',
  "MIMI'S ARUBA APTS (ALTO VISTA 39B)",
  "MINCHI'S BAR",
  'MIRAFLORES BAR',
  'MONASTERY SUITES ARUBA',
  'MONTAÑA PARK ECO RESORT (MONTAÑA 51)',
  'MVC EAGLE',
  'MY ARUBAN HOME APTS. BAKVAL 15A',
  'NAIMA LUXURY COTTAGE',
  'NAÏMA LUXURY COTTAGE',
  'NASVILLE APTS (TANKI LEENDERT 277D)',
  'OASIS INN - HOUSE/APTM. (CUMANA 101E)',
  'OASIS LUXURY CONDOMINIUMS (JE IRAUSQUIN BLVD 242',
  'OCALIA APTS (GRENEDAWEG 12B)',
  'OCEAN Z BOUTIQUE HOTEL',
  'OCEANIA RESIDENCE',
  'PALAZIO REAL ESTATE',
  'PALAZZIO STUDIO APARTMENTS',
  'PALM APPARTMENTS (NOORD 41A)',
  'PALM ARUBA CONDOS',
  'PALM BEACH APARTMENTS',
  'PALM BEACH RETREAT (PALM BEACH 504)',
  'PALMA ARUBA CONDOMINIUM',
  'PALMA REAL APARTMENTS',
  'PAPA SIGA BAR',
  'PARADERA APARTMENT',
  'PARADERA PARK APARTMENTS',
  'PARADISE BEACH VILLAS',
  'PARKE ARAWA KUNUKU HOUSES (MOKO 46A)',
  'PARROT VILLA',
  'PASO APPARTMENTS (VICTOR HUGOSTR. 14)',
  'PATIRI APARTMENT',
  "PAULINE'S APARTMENTS (KEITO 22)",
  'PEARL ARUBA CONDOS (JE IRAUSQUIN 232B)',
  "PERLE D'OR APT. (BOEGOEROEI 11Z)",
  'PIANITO BAR',
  'PISTA Q',
  'PLAYA LINDA BEACH RESORT',
  'PLEASURE ZONE',
  'POS CHIQUITO APARTMENTS (POS CHIQUITO 11F)',
  'PRIMAVERA APPARTMENTS',
  'PRIME BEACH RESORT N.V.',
  'PRIVADA STAYS, POS ABOU 5',
  'PUNTO DI ORO APPARTMENT (TANK LEENDERT 121K)',
  'QUALITY APARTMENTS (SCHOTLAND STR. 70)',
  'RADISSON BLU',
  'RADISSON BLU ARUBA',
  'RAINBOW APARTMENTS',
  'RAQUET CLUB ARUBA',
  'RENAISSANCE ARUBA BEACH RESORT',
  'RENAISSANCE SUITES',
  'RH BOUTIQUE HOTEL AUA X REHOBOTH',
  'RITZ CARLTON',
  'RIU ANTILLAS / WESTIN',
  'RIU PALACE',
  'ROGERS WINDSURF VILLAGE',
  'RON Y MENTA',
  "ROWIGINI'S",
  'ROXY BAR',
  'ROYAL PALM CLUB',
  'RUTENA SUITE',
  'SABRINAS APARTMENT',
  'SAI GON BAR',
  'SAILBOARD VACATIONS',
  'SALAMANDER APTS',
  'SALINA VILLA',
  'SANTO DOMINGO BAR',
  'SASAKI APARTMENTS N.V.',
  'SAYONARA BAR',
  'SEA BREEZE APT(STADIONWEG)',
  'SEABREEEZE APTS (MALOHISTR 5, POS CHIQUITO)',
  'SECRETS BABY BEACH ARUBA',
  'SUNFLOWER VILAS ARUBA (SALINA SERCA 25E)',
  'SUNSET BEACH STUDIOS (LG SMITH BLVD 486)',
  'SUNSET VILLAS',
  'SUNSHINE APARTMENTS (BUBALI 86-T)',
  'SWISS PARADISE',
  'TAMARIJN ARUBA BEACH RESORT',
  'TAZAGAL RESIDENCE',
  'THE ARUBA HOUSE DELUXE ESTATE',
  'THE ARUBAN RESORT',
  'THE MILL',
  'THE PALM LEAF APARTMENTS',
  'THE ST. REGIS ARUBA RESORT',
  'THE TANGO SUITE',
  'TIERRA DE SOL RESORT',
  'TROPICAL HAVEN',
  'TROPICANA HOTEL',
  'TRYP BY WYNDHAM ARUBA',
  'TU CASITA EN ARUBA',
  'TURIBANA PLAZA APT (CAYA FRANS FIGAROA 124)',
  'VENUS BAR',
  'VICTORIA CITY HOTEL',
  'VILLA ALOE ARUBA ALOE STR 14',
  'VILLA BORONCANA',
  'VILLA FOR SALE BOEGOEROEI 33 C',
  'VILLA ROYALE (KURIMIAUW 87)',
  'VILLA SEA VIEW',
  'VILLA TROPICAL',
  'VISTALMAR (BUCUTI WEG 28)',
  'VOCO SURFSIDE ARUBA',
  'WACAMAYA VILLAGE APTS. (WESTPUNT)',
  'WAKIRI VACATION RENTALS',
  'WHITE BEACH APTS (EAGLE BEACH)',
  "WONDERS BED AND B'FAST (EMMASTRAAT 63)",
  'WONER BOUTIQUE HOTEL',
  'ZEGA APARTMENT (SABANA BLANCO 69 A)',
  'ZENSE VACATION RENTALS',
];

/**
 * Aruba ED Card sections — laid out in India's order so the customer-
 * facing finish page reads consistently across destinations:
 *   Trip → Personal → Birth & Identity → Home Address → Employment →
 *   Passport → Accommodation → Documents → Additional
 *
 * Sections India has but Aruba doesn't (Family, References, Security):
 *   intentionally omitted from the built-in defaults. If we want to
 *   reintroduce them later (e.g. a higher-risk destination needs them),
 *   the admin schema editor lets us add them back — they don't need to
 *   live in code.
 *
 * Field keys are reused across countries where they mean the same
 * thing (firstName, lastName, dob, gender, address, city, state, zip,
 * countryOfBirth, etc.) so admin views and traveler JSON resolve the
 * same way regardless of destination.
 */
export const BUILT_IN_ARUBA_SECTIONS: CustomSection[] = [
  // 1 ─ Trip
  {
    key: 'trip',
    title: 'Trip',
    icon: 'Plane',
    description: 'Your arrival and departure details.',
    pages: ['finish'],
    fields: [
      { key: 'arrivalDate',          label: 'Arrival Date',                  type: 'date',   required: true, helpText: 'Must be within 7 days of travel.' },
      // The Aruba ED Card form pre-selects "No" by default — and the
      // overwhelming majority of our customers are non-residents
      // (tourists). Marking the field as `skip` for the bot means it
      // doesn't waste time trying to click a radio that's already
      // correct. Customers who ARE residents will need manual adjust
      // before submit (rare enough to be a manual step). Customer-side
      // schema still renders the field as a normal Yes/No so we
      // capture the right answer in our traveler data.
      { key: 'isResidentOfAruba',    label: 'Are you a resident of Aruba?',  type: 'radio',  required: true, options: ['Yes', 'No'], botAction: 'skip' },
      // Passport upload comes mid-section so the bot uploads it on
      // Step 2 (Passport Details) BEFORE advancing further into the
      // form. Otherwise the bot would fill Trip's later fields
      // (Country of Departure etc.) which live on Steps 3-6,
      // clicking Next past Step 2 and never coming back for the
      // upload. Customer-side it reads naturally as part of Trip —
      // "tell us when you arrive, residency, upload your passport,
      // then the rest of your travel details".
      { key: 'passportFile',         label: 'Upload Passport',               type: 'file',   required: true, helpText: 'JPEG, PNG, or HEIC. Photo of the passport bio page. Aruba OCRs this to auto-fill the next step.' },
      // Country of Birth lives on Step 2 (Passport Details) but is
      // the ONLY non-auto-filled field there — OCR can't see the
      // passport-holder's birth country from the bio page image. So
      // it has to be filled by the bot. Placed right after the
      // upload so the bot does it before advancing past Step 2.
      // (The same field also still appears in the customer-facing
      // Personal section below — duplicate fine for customer, the
      // bot uses whichever has a value first.)
      { key: 'countryOfBirth',       label: 'Country of Birth',              type: 'select', required: true, options: ARUBA_FULL_COUNTRY_LIST },
      { key: 'countryOfDeparture',   label: 'Country of Departure',          type: 'select', required: true, options: ARUBA_FULL_COUNTRY_LIST },
      { key: 'arrivalTravelMode',    label: 'Arrival Travel Mode',           type: 'radio',  required: true, options: ['Air', 'Sea'] },
      // Air travellers: Airline + Flight Number.
      // Sea travellers: Vessel Name (skip the airline fields, fill
      // the vessel field with the ship name).
      // We keep all three fields in the schema as `required: false`
      // so the customer can fill whichever pair applies. The bot
      // (and any future validator) decides which pair to use based
      // on the Travel Mode value.
      { key: 'arrivalAirline',       label: 'Arrival Airline',               type: 'select', required: false, options: ARUBA_AIRLINES, helpText: 'Required if travelling by Air.' },
      { key: 'arrivalFlightNumber',  label: 'Arrival Flight Number',         type: 'text',   required: false, helpText: 'Required if travelling by Air. Letters + digits (e.g. AA1234).' },
      { key: 'arrivalVesselName',    label: 'Arrival Vessel Name',           type: 'text',   required: false, helpText: 'Required if travelling by Sea. Name of the ship / cruise vessel.' },
      // Schema label kept short ("Departure Date" not "Departure
      // Date from Aruba") so the bot's getByLabel fallback can match
      // Aruba's actual form label verbatim. Customer-side helpText
      // adds the "from Aruba" context without confusing the matcher.
      { key: 'departureDate',        label: 'Departure Date',                type: 'date',   required: true, helpText: 'The date you leave Aruba.' },
      { key: 'departureTravelMode',  label: 'Departure Travel Mode',         type: 'radio',  required: true, options: ['Air', 'Sea'] },
      { key: 'departureAirline',     label: 'Departure Airline',             type: 'select', required: false, options: ARUBA_AIRLINES, helpText: 'Required if departing by Air.' },
      { key: 'departureFlightNumber',label: 'Departure Flight Number',       type: 'text',   required: false, helpText: 'Required if departing by Air. Letters + digits (e.g. AA1234).' },
      // Operator Name — Aruba's Departure form shows this whenever
      // the "Airline" is a non-commercial type (Other / Private /
      // Charter etc.). The bot defaults the airline-type to "Other"
      // (since few of our customers fly with Aruba's pre-listed
      // carriers on the way out), so this field's value gets used
      // as the actual operator.
      //
      // botSelector pins it to `#customDepartureFlightNumber` — the
      // bizarre ID Aruba uses for the post-"Other" text input
      // (formcontrolname="flightNumber" but ID has a "custom"
      // prefix). Heuristic selectors would never guess this; the
      // explicit pin is the cleanest signal.
      { key: 'departureOperatorName',label: 'Departure Operator Name',       type: 'text',   required: false, botSelector: '#customDepartureFlightNumber', helpText: 'Name of the airline / charter operator handling your departure flight.' },
      { key: 'departureVesselName',  label: 'Departure Vessel Name',         type: 'text',   required: false, helpText: 'Required if departing by Sea. Name of the ship / cruise vessel.' },
      // priorVisits moved out of Trip section — it lives on the
      // "Trip Information" accordion of Aruba's form (the same one
      // as placeOfStay / bookingMethod), which renders AFTER the
      // "Personal Information" accordion. If we kept it here, the
      // bot would hit it as the last Trip field, click Next twice
      // to advance past Personal Info to reach it, then never be
      // able to go back to Personal Info to fill those fields.
    ],
  },
  // 2 ─ Personal — folded in Birth & Identity (countryOfBirth +
  //   nationality), Employment (occupation), and Passport (number,
  //   expiry, dual citizenship) so the customer fills out everything
  //   about themselves in one continuous step instead of jumping
  //   between five tiny sidebar groups.
  //
  //   Email isn't collected here — customer entered it on the apply
  //   page (stored as billingEmail) and we copy it into the traveler
  //   record on submit. Asking again would just be friction.
  {
    key: 'personal',
    title: 'Personal',
    icon: 'User',
    description: 'About you, your nationality, occupation, and passport.',
    pages: ['finish'],
    // Aruba's gov form combines our `personal` + `address` schemas into
    // ONE "Personal Information" panel (Country of Residence, ZIP, State,
    // City, Address, Number, Suffix, Occupation, Purpose of Visit, Dual
    // Citizenship are all on the same page). Tell the bot not to click
    // Next yet — it should keep filling fields from the next section
    // (address) on the same panel.
    botSkipNext: true,
    fields: [
      // Most fields on Aruba's Passport Details step (Step 2) are
      // readonly and auto-populate from the uploaded passport image
      // via OCR. The bot doesn't need to fill them — marking as
      // `skip` saves the bot from chasing readonly inputs across
      // the form trying to find them. Customer-side still renders
      // them as normal inputs so we capture the values in our DB
      // (and so they show in the admin order view).
      //
      // Country of Birth moved to Trip section (right after passport
      // upload) since it lives on the same form step as the upload
      // and is the only field there OCR doesn't auto-fill — that
      // one is the only Step-2 field the bot needs to touch.
      // botSelector pins map our schema keys to Aruba's
      // formcontrolnames where they don't match verbatim, AND
      // handle Aruba's indexed-id convention. Even for the primary
      // traveler Aruba suffixes every per-traveler input with `-0`
      // (id="firstNames-0", "dateOfBirth-0", etc.) — so we use
      // `[id^="X-"]` prefix selectors, plus `visible=true.first()`
      // (applied downstream in applyField) picks the active
      // accordion's instance when multiple travelers are on the
      // page.
      //
      // Key mismatches:
      //   - firstName → firstNames (plural on the gov form)
      //   - dob → dateOfBirth
      //   - passportExpiryDate → passportExpiration
      //
      // These pins ONLY come into play when OCR fails and the bot
      // switches the action from `skip` to `fill`. Until then they
      // do nothing — the schema's `botAction: 'skip'` short-circuits
      // the field before applyField looks at the selector.
      { key: 'firstName',            label: 'First Name(s)',                 type: 'text',   required: true, botSelector: '[id^="firstNames-"], [formcontrolname="firstNames"]', helpText: 'As shown on passport. Max 50 characters.', botAction: 'skip' },
      // Aruba's id is `lastNames-N` (plural) even though the
      // formcontrolname is singular — they don't match each other.
      { key: 'lastName',             label: 'Last Name(s)',                  type: 'text',   required: true, botSelector: '[id^="lastNames-"], [formcontrolname="lastName"]', helpText: 'As shown on passport. Max 50 characters.', botAction: 'skip' },
      { key: 'dob',                  label: 'Date of Birth',                 type: 'date',   required: true, botSelector: '[id^="dateOfBirth-"], [formcontrolname="dateOfBirth"]', botAction: 'skip' },
      { key: 'gender',               label: 'Gender',                        type: 'radio',  required: true, options: ['Male', 'Female', 'Other'], botAction: 'skip' },
      { key: 'nationality',          label: 'Nationality',                   type: 'select', required: true, options: ARUBA_FULL_COUNTRY_LIST, botSelector: '[id^="nationality-"], [formcontrolname="nationality"]', botAction: 'skip' },
      { key: 'occupation',           label: 'Occupation',                    type: 'select', required: true, options: ARUBA_OCCUPATIONS },
      { key: 'passportNumber',       label: 'Passport Number',               type: 'text',   required: true, botSelector: '[id^="passportNumber-"], [formcontrolname="passportNumber"]', botAction: 'skip' },
      { key: 'passportExpiryDate',   label: 'Passport Expiration Date',      type: 'date',   required: true, botSelector: '[id^="passportExpiration-"], [formcontrolname="passportExpiration"]', botAction: 'skip' },
      // Purpose of Visit lives here for the BOT — Aruba's Personal
      // Information step requires it. Customer-side we already
      // captured it on the /apply page (it's stored at the order
      // level, not on the traveler), so we hide it here to avoid
      // double-asking. The bot resolves the value from
      // `order.purposeOfVisit` (special-cased in process-aruba.ts).
      // Options mirror lib/countryConfig.ts ARUBA.purposeOptions
      // so admin-side bot mapping has the correct option list to
      // pick from if they want to translate values.
      { key: 'purposeOfVisit',       label: 'Purpose of Visit',              type: 'select', required: true, hidden: true,
        helpText: 'Auto-filled from your application — bot uses order.purposeOfVisit.',
        options: ['Vacation','Business','Incentive','Wedding','Honeymoon','Board Cruiseship','Event','One Happy Workspace','Medical treatment'] },
      // Label matches Aruba's form heading ("Dual Citizenship") so
      // the bot's getByLabel fallback resolves. The full question
      // moves to helpText for the customer.
      { key: 'dualCitizenship',      label: 'Dual Citizenship',              type: 'radio',  required: true, options: ['No', 'Yes'], helpText: 'Do you hold citizenship of more than one country?' },
    ],
  },
  // 3 ─ Home Address
  {
    key: 'address',
    title: 'Home Address',
    icon: 'Home',
    description: 'Where you live permanently.',
    pages: ['finish'],
    fields: [
      { key: 'countryOfResidence',   label: 'Country of Residence',          type: 'select', required: true, options: ARUBA_FULL_COUNTRY_LIST },
      // Single combined address field for the customer — Aruba's
      // gov form splits address / number / suffix into three inputs,
      // but US customers think in one-line addresses ("123 Main St
      // Apt 4B"). The bot parses this string and fills all three
      // gov fields automatically (see process-aruba.ts).
      { key: 'address',              label: 'Address',                       type: 'text',   required: true, helpText: 'Street address with house/building number — e.g. "123 Main Street" or "456 Oak Ave Apt 4B".' },
      // streetNumber + addressSuffix kept in the schema so the bot
      // has a target to fill on Aruba's form, but HIDDEN from the
      // customer form. Bot derives values from the combined address
      // field. Required is false on the customer side since they
      // never see these inputs.
      { key: 'streetNumber',         label: 'Street Number',                 type: 'text',   required: false, hidden: true, botSelector: '#residenceNumber', helpText: 'Auto-derived from Address by the bot.' },
      { key: 'addressSuffix',        label: 'Suffix',                        type: 'text',   required: false, hidden: true, botSelector: '#residenceSuffix', helpText: 'Auto-derived from Address by the bot.' },
      { key: 'city',                 label: 'City',                          type: 'text',   required: true, helpText: 'Max 50 characters.' },
      { key: 'state',                label: 'State / Region',                type: 'text',   required: true, helpText: 'State or region of residence.' },
      // Aruba's gov form uses id="zipCode" / formcontrolname="zipCode".
      // Our schema key stays "zip" for cross-country consistency.
      { key: 'zip',                  label: 'ZIP Code',                      type: 'text',   required: true, botSelector: '#zipCode', helpText: 'Max 15 characters.' },
    ],
  },
  // 4 ─ Additional
  //  Where you're staying + Aruba-specific marketing questions.
  //  Place-of-stay lives here (rather than its own one-question
  //  Accommodation step) since it's a single dropdown — no point
  //  burning a whole sidebar step on it.
  {
    key: 'additional',
    title: 'Additional',
    icon: 'ListChecks',
    description: 'Where you\'re staying and a few last questions about your trip.',
    pages: ['finish'],
    fields: [
      { key: 'placeOfStay',          label: 'Place of Stay',                 type: 'select', required: true, options: ARUBA_PLACE_OF_STAY },
      // Renders on Aruba's form ONLY after Place of Stay is picked.
      // The bot fills `placeOfStay` first → Aruba reveals this
      // dropdown → bot's per-field look-ahead detects it visible
      // (via getByLabel on "Name of Place of Stay") and fills.
      // No `botSelector` pin — we don't know Aruba's exact
      // formcontrolname yet, so we rely on the label fallback.
      { key: 'placeOfStayName',      label: 'Name of Place of Stay',         type: 'select', required: true, options: ARUBA_PLACE_OF_STAY_NAMES, helpText: 'The specific hotel / apartment / property you\'re staying at.' },
      { key: 'bookingMethod',        label: 'How did you book your trip?',   type: 'select', required: true, options: ARUBA_BOOKING_METHOD },
      // Aruba names these `sourceInquiry` / `choosingReason` on the
      // gov form. Schema keys stay descriptive for our admin/UI.
      { key: 'heardAboutAruba',      label: 'How did you hear about Aruba?', type: 'select', required: true, options: ARUBA_HEARD_ABOUT, botSelector: '#sourceInquiry' },
      { key: 'whyPickAruba',         label: 'Why did you pick Aruba?',       type: 'select', required: true, options: ARUBA_WHY_PICK, botSelector: '#choosingReason' },
      // priorVisits lives on Aruba's "Trip Information" accordion
      // (same one as placeOfStay etc.) — keeping it here puts the
      // bot's iteration in the right accordion order.
      // Short label so getByLabel matches Aruba's "Prior Visits" UI.
      { key: 'priorVisits',          label: 'Prior Visits to Aruba',         type: 'select', required: true, options: ARUBA_PRIOR_VISITS, helpText: 'How many times you\'ve been to Aruba before.' },
    ],
  },
  // 5 ─ Contact (bot-only)
  //  Aruba's gov form ends with a "Contact Information" accordion
  //  that asks for the customer's email and a confirmation. We
  //  already have the email (collected on /apply as billingEmail),
  //  so this section is entirely hidden from the customer's finish
  //  form — both fields are flagged hidden:true and the bot pulls
  //  the value from `order.billingEmail`.
  //
  //  Why a separate section instead of folding it into `additional`?
  //  Contact Information is its own accordion on Aruba's site
  //  (accordion-7, after Trip Information). Keeping it as a
  //  separate schema section means the bot's section-boundary Next
  //  click moves from Trip Information to Contact Information,
  //  then after filling email+emailConfirmation clicks Next once
  //  more to advance to Review. Folding it in would skip that
  //  accordion-jump and the bot would try to fill email on the
  //  wrong page.
  {
    key: 'contact',
    title: 'Contact',
    icon: 'Mail',
    description: 'Email address for your confirmation (bot-filled from your account).',
    pages: ['finish'],
    fields: [
      { key: 'email',             label: 'Email',                 type: 'email', required: true, hidden: true, botSelector: '#email',             helpText: 'Auto-filled from your account email.' },
      { key: 'emailConfirmation', label: 'Confirm Email',         type: 'email', required: true, hidden: true, botSelector: '#emailConfirmation', helpText: 'Auto-filled from your account email.' },
    ],
  },
  // 6 ─ Payment (bot-only)
  //  Aruba's final accordion is Payment + Submit. The bot types the
  //  company card stored in /admin/settings/payment (encrypted at
  //  rest, decrypted only at run-time). All fields hidden — never
  //  asked of the customer. After this section the bot does NOT
  //  click Next (it's the last section in the schema, so the
  //  isLastSection guard kicks in) — the human verifies the typed
  //  card details and clicks Submit / Pay themselves.
  //
  //  - creditCardNumber: id="creditCardNumber", maxlength=16
  //  - expirationMonth:  select with options "January"–"December",
  //    pinned to id="paymentExpirationMonth" (Aruba prefixes with
  //    "payment" because the form also has passport expiration
  //    selects with the same formcontrolname "expirationMonth").
  //  - expirationYear:   select with 4-digit years, same prefix.
  //  - securityCode:     id="SecurityCode" (capital S), 3–4 digits.
  {
    key: 'payment',
    title: 'Payment',
    icon: 'CreditCard',
    description: 'Credit card for the visa-application fee (bot-filled from /admin/settings/payment).',
    pages: ['finish'],
    // Aruba's flow goes Contact → Review → Payment. The bot fills
    // Contact and clicks Next (which opens Review), then waits for
    // the human to click Next on Review themselves (so they can
    // sanity-check the data before payment is touched). Once the
    // human advances and the Credit Card Number input becomes
    // visible, the bot resumes and fills all four payment fields.
    botWaitForHuman: true,
    fields: [
      { key: 'creditCardNumber',  label: 'Credit Card Number', type: 'text',   required: true, hidden: true, botSelector: '#creditCardNumber',       helpText: 'Auto-filled from the bot-payment vault.' },
      { key: 'expirationMonth',   label: 'Expiration Month',   type: 'select', required: true, hidden: true, botSelector: '#paymentExpirationMonth',
        // Match Aruba's dropdown text exactly so selectByText
        // resolves on the first try. Bot translates the stored "01"–"12"
        // to these labels before applying.
        options: ['January','February','March','April','May','June','July','August','September','October','November','December'] },
      { key: 'expirationYear',    label: 'Expiration Year',    type: 'select', required: true, hidden: true, botSelector: '#paymentExpirationYear' },
      { key: 'securityCode',      label: 'Security Code',      type: 'text',   required: true, hidden: true, botSelector: '#SecurityCode',           helpText: 'CVV / CVC. 3–4 digits.' },
    ],
  },
];

export function defaultSchema(country: string): ApplicationSchema {
  const upper = country.toUpperCase();
  if (upper === 'INDIA') {
    return { country: 'INDIA', sections: BUILT_IN_INDIA_SECTIONS };
  }
  if (upper === 'ARUBA') {
    return { country: 'ARUBA', sections: BUILT_IN_ARUBA_SECTIONS };
  }
  return { country: upper, sections: [] };
}

/**
 * Merge stored admin overrides with the current built-in defaults.
 *
 * Why: if we ever add a new built-in field/section in code, admins who
 * already saved their schema shouldn't lose the new one. So on GET we:
 *  1. Start with current code defaults.
 *  2. For each built-in section/field, apply any admin override by key.
 *  3. Append any stored custom sections (builtIn !== true) at the end.
 */
export function mergeWithDefaults(stored: Partial<ApplicationSchema> | null, country: string): ApplicationSchema {
  const defaults = defaultSchema(country);
  if (!stored || !Array.isArray(stored.sections)) return defaults;

  // Tombstones: built-in keys the admin has explicitly deleted. The merge
  // skips reinjecting those even though they're still in `defaults`.
  const tombstones = new Set<string>(Array.isArray(stored.deletedBuiltIns) ? stored.deletedBuiltIns : []);

  // Bucket stored sections into "matches a built-in" (override) vs.
  // "truly custom" (admin-added). We trust the section KEY as the
  // identity — not the `builtIn` flag, because legacy data can have
  // `builtIn: false` set on what is really a built-in section (e.g.
  // an early save that ran before the matching default was added to
  // BUILT_IN_<COUNTRY>_SECTIONS in code). Deduping by key prevents
  // the same section from being rendered twice (once as a default,
  // once as a "custom" leftover with the same key).
  const defaultKeys = new Set<string>(defaults.sections.map(d => d.key));
  const storedBuiltInByKey = new Map<string, CustomSection>();
  const storedCustom: CustomSection[] = [];
  for (const s of stored.sections) {
    if (defaultKeys.has(s.key)) storedBuiltInByKey.set(s.key, s);
    else storedCustom.push(s);
  }

  // Rebuild built-ins in the *stored* order if admins reordered, otherwise keep default order.
  const storedBuiltInOrder = stored.sections.filter(s => defaultKeys.has(s.key)).map(s => s.key);
  const orderedBuiltInKeys = storedBuiltInOrder.length > 0
    ? [
        ...storedBuiltInOrder.filter(k => defaults.sections.some(d => d.key === k)),
        ...defaults.sections.filter(d => !storedBuiltInOrder.includes(d.key)).map(d => d.key),
      ]
    : defaults.sections.map(d => d.key);

  const mergedBuiltIns = orderedBuiltInKeys
    // Drop sections the admin has deleted entirely.
    .filter(key => !tombstones.has(key))
    .map(key => {
      const def = defaults.sections.find(d => d.key === key)!;
      const ov = storedBuiltInByKey.get(key);
      // Pass tombstones through so field-level deletions also stick.
      if (!ov) return filterDeletedFields(def, key, tombstones);
      return mergeSection(filterDeletedFields(def, key, tombstones), ov);
    });

  return {
    country: country.toUpperCase(),
    sections: [...mergedBuiltIns, ...storedCustom],
    // Pass through tombstones as-is. Skip when missing/empty/non-array so the
    // output stays clean (callers iterate it as an array).
    deletedBuiltIns: Array.isArray(stored.deletedBuiltIns) && stored.deletedBuiltIns.length > 0
      ? [...stored.deletedBuiltIns]
      : undefined,
    updatedAt: stored.updatedAt,
  };
}

/** Strip built-in fields whose `${sectionKey}.${fieldKey}` is in tombstones. */
function filterDeletedFields(def: CustomSection, sectionKey: string, tombstones: Set<string>): CustomSection {
  const survivors = def.fields.filter(f => !tombstones.has(`${sectionKey}.${f.key}`));
  return survivors.length === def.fields.length ? def : { ...def, fields: survivors };
}

function mergeSection(def: CustomSection, ov: CustomSection): CustomSection {
  // Default field map for quick lookup
  const defFieldByKey = new Map(def.fields.map(f => [f.key, f]));
  const ovFieldByKey = new Map(ov.fields.map(f => [f.key, f]));
  const ovFieldOrder = ov.fields.map(f => f.key);

  // Built-in fields ordered as stored (or default if no stored order)
  const orderedBuiltInFieldKeys = ovFieldOrder.length > 0
    ? [
        ...ovFieldOrder.filter(k => defFieldByKey.has(k)),
        ...def.fields.filter(d => !ovFieldOrder.includes(d.key)).map(d => d.key),
      ]
    : def.fields.map(f => f.key);

  const mergedBuiltInFields = orderedBuiltInFieldKeys.map(k => {
    const d = defFieldByKey.get(k)!;
    const o = ovFieldByKey.get(k);
    if (!o) return d;
    // Preserve immutable attrs: key, type, builtIn, options. Take everything else from override.
    return {
      ...d,
      label: o.label ?? d.label,
      required: o.required ?? d.required,
      placeholder: o.placeholder ?? d.placeholder,
      helpText: o.helpText ?? d.helpText,
      hidden: o.hidden ?? d.hidden,
      botSelector: o.botSelector ?? d.botSelector,
      botAction: o.botAction ?? d.botAction,
      // Options can be extended by admin for dropdowns
      options: o.options && o.options.length > 0 ? o.options : d.options,
    };
  });

  // Custom fields that admin added to this built-in section
  const customFields = ov.fields.filter(f => !f.builtIn && !defFieldByKey.has(f.key));

  return {
    key: def.key,
    title: ov.title ?? def.title,
    icon: ov.icon ?? def.icon,
    emoji: ov.emoji ?? def.emoji,
    description: ov.description ?? def.description,
    hidden: ov.hidden ?? def.hidden,
    builtIn: true,
    // `pages` is a built-in trait — admins can't reassign a section to a
    // different page via the editor. Always take it from the code default.
    pages: def.pages,
    // visibleForVisaTypes IS admin-editable, so an explicit override wins.
    // `??` means undefined falls through to the default; an empty array
    // override is preserved (= "visible for all" via isVisibleForVisa).
    visibleForVisaTypes: ov.visibleForVisaTypes ?? def.visibleForVisaTypes,
    // Same merge rule for visibleForPurposes (sub-purpose filter).
    visibleForPurposes:  ov.visibleForPurposes  ?? def.visibleForPurposes,
    fields: [...mergedBuiltInFields, ...customFields],
  };
}

/** Helper: look up a field's override in a schema (for finish page / admin detail). */
export function findField(schema: ApplicationSchema, sectionKey: string, fieldKey: string): CustomField | undefined {
  return schema.sections.find(s => s.key === sectionKey)?.fields.find(f => f.key === fieldKey);
}

/** Helper: look up a section's override. */
export function findSection(schema: ApplicationSchema, sectionKey: string): CustomSection | undefined {
  return schema.sections.find(s => s.key === sectionKey);
}

/**
 * Visibility check for sections + bot fields. `undefined`, missing, and
 * empty arrays all mean "visible for every visa type" — the default.
 * A non-empty list means visible ONLY for those visa codes.
 */
export function isVisibleForVisa(visibleForVisaTypes: string[] | undefined, visaType: string | undefined): boolean {
  if (!visibleForVisaTypes || visibleForVisaTypes.length === 0) return true;
  if (!visaType) return true; // no visa context — be lenient (e.g. admin previews)
  return visibleForVisaTypes.includes(visaType);
}

/**
 * Same shape as isVisibleForVisa but for PurposeOfVisit values. Empty/missing
 * means "visible for any purpose"; non-empty means only those.
 */
export function isVisibleForPurpose(visibleForPurposes: string[] | undefined, purpose: string | undefined): boolean {
  if (!visibleForPurposes || visibleForPurposes.length === 0) return true;
  if (!purpose) return true; // be lenient when no purpose context yet
  return visibleForPurposes.includes(purpose);
}

/**
 * Compound visibility — a section/field is visible only when BOTH its
 * visa-type and purpose-of-visit constraints (if any) pass.
 */
export function isSectionVisible(
  section: Pick<CustomSection, 'visibleForVisaTypes' | 'visibleForPurposes'>,
  ctx: { visaType?: string; purposeOfVisit?: string },
): boolean {
  return (
    isVisibleForVisa(section.visibleForVisaTypes, ctx.visaType) &&
    isVisibleForPurpose(section.visibleForPurposes, ctx.purposeOfVisit)
  );
}
