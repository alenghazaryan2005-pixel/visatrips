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
  | 'checkbox';

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

export function defaultSchema(country: string): ApplicationSchema {
  if (country.toUpperCase() === 'INDIA') {
    return { country: 'INDIA', sections: BUILT_IN_INDIA_SECTIONS };
  }
  return { country: country.toUpperCase(), sections: [] };
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

  const storedBuiltInByKey = new Map<string, CustomSection>();
  const storedCustom: CustomSection[] = [];
  for (const s of stored.sections) {
    if (s.builtIn) storedBuiltInByKey.set(s.key, s);
    else storedCustom.push(s);
  }

  // Rebuild built-ins in the *stored* order if admins reordered, otherwise keep default order.
  const storedBuiltInOrder = stored.sections.filter(s => s.builtIn).map(s => s.key);
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
