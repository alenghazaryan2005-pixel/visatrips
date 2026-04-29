/**
 * Bot mapping: how gov-site form fields get populated by the Playwright bot.
 *
 * - The catalog (all gov-site fields across every step) is hardcoded here as
 *   BUILT_IN defaults — it reflects what the bot script actually fills.
 * - Admins can override each field's source via the admin "Bot" tab.
 *   Overrides persist as a single Setting key `bot.mapping.<COUNTRY>`.
 * - At bot runtime (Phase 2), scripts/process-visa.ts will load this mapping
 *   and use `resolveBotField(field, traveler, order)` to compute the value.
 *
 * Storage shape (the stored Setting value):
 *   { country: 'INDIA', overrides: { 'applicant.surname': {type:'schema', fieldKey:'lastName'}, ... } }
 */

export type BotAction = 'fill' | 'select' | 'click' | 'upload' | 'check';

/** Where the value comes from. */
export type BotSource =
  | { type: 'schema';    fieldKey: string }   // e.g. traveler[fieldKey]
  | { type: 'hardcoded'; value: string }      // fixed string — e.g. "ORDINARY"
  | { type: 'skip' }                          // don't fill this field
  | { type: 'manual' };                       // user does this in the browser (CAPTCHA, crop, etc.)

export interface BotField {
  /** Unique key within its step — used in the overrides map as `${step.key}.${field.key}`. */
  key: string;
  /** Human-readable label from the gov form. */
  label: string;
  /** CSS selector (or position hint like `Input[0]`) on the gov site. */
  selector: string;
  /** Playwright action type. */
  action: BotAction;
  /** Optional hint displayed under the field. */
  hint?: string;
  /** Default source — used unless admin overrides. */
  defaultSource: BotSource;
}

export interface BotStep {
  key: string;
  label: string;
  description?: string;
  fields: BotField[];
}

export interface BotMapping {
  country: string;
  overrides: Record<string, BotSource>;  // key: `${stepKey}.${fieldKey}`
  updatedAt?: string;
}

export function botMappingSettingKey(country: string): string {
  return `bot.mapping.${country.toUpperCase()}`;
}

/**
 * BUILT-IN INDIA BOT CATALOG
 * Every gov-site field the bot (scripts/process-visa.ts) interacts with,
 * grouped by the page/step in the gov flow. Keep in sync when the bot script
 * changes.
 */
export const BUILT_IN_INDIA_BOT_STEPS: BotStep[] = [
  {
    key: 'registration',
    label: 'Step 1 — Initial Registration',
    description: 'Passport + visa basics + CAPTCHA.',
    fields: [
      { key: 'nationality',        label: 'Nationality',             selector: '#nationality_id',   action: 'select', defaultSource: { type: 'schema', fieldKey: 'passportCountry' } },
      { key: 'passportType',       label: 'Passport Type',           selector: '#ppt_type_id',      action: 'select', defaultSource: { type: 'hardcoded', value: 'ORDINARY' } },
      { key: 'portOfArrival',      label: 'Port of Arrival',         selector: '#missioncode_id',   action: 'select', defaultSource: { type: 'schema', fieldKey: 'arrivalPoint' } },
      { key: 'dob',                label: 'Date of Birth',           selector: '#dob_id',           action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'dob' } },
      { key: 'email',              label: 'Email',                   selector: '#email_id',         action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'email' } },
      { key: 'emailRepeat',        label: 'Re-enter Email',          selector: '#email_re_id',      action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'email' } },
      { key: 'visaPurpose',        label: 'Visiting India for (Visa Purpose)', selector: "select[id*='visit/purpose/visa']", action: 'select', defaultSource: { type: 'schema', fieldKey: 'visaType' } },
      { key: 'arrivalDate',        label: 'Expected Date of Arrival', selector: '#jouryney_id',     action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'arrivalDate' } },
      { key: 'declarationCheck',   label: 'Declaration Checkbox',    selector: '#read_instructions_check', action: 'check', defaultSource: { type: 'hardcoded', value: 'true' } },
      { key: 'captcha',            label: 'CAPTCHA',                 selector: '#captcha',          action: 'fill',   defaultSource: { type: 'manual' }, hint: 'Solved by hand — captcha defeats automation.' },
    ],
  },
  {
    key: 'applicant',
    label: 'Step 2 — Applicant Details',
    description: 'Name, gender, identity, religion, passport details.',
    fields: [
      { key: 'surname',            label: 'Surname',                 selector: 'Input[0] (visible)',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'lastName' }, hint: 'Auto-uppercased.' },
      { key: 'givenName',          label: 'Given Name',              selector: 'Input[1] (visible)',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'firstName' } },
      { key: 'gender',             label: 'Gender',                  selector: 'Select[0] (visible)',  action: 'select', defaultSource: { type: 'schema', fieldKey: 'gender' } },
      { key: 'cityOfBirth',        label: 'Town/City of Birth',      selector: 'Input[2] (visible)',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'cityOfBirth' } },
      { key: 'countryOfBirth',     label: 'Country/Region of Birth', selector: 'Select[1] (visible)',  action: 'select', defaultSource: { type: 'schema', fieldKey: 'countryOfBirth' } },
      { key: 'citizenshipId',      label: 'Citizenship/National ID', selector: 'Input[3] (visible)',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'citizenshipId' } },
      { key: 'religion',           label: 'Religion',                selector: 'Select[2] (visible)',  action: 'select', defaultSource: { type: 'schema', fieldKey: 'religion' } },
      { key: 'visibleMarks',       label: 'Visible Marks',           selector: 'Input[4] (visible)',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'visibleMarks' } },
      { key: 'education',          label: 'Educational Qualification', selector: 'Select[3] (visible)', action: 'select', defaultSource: { type: 'schema', fieldKey: 'educationalQualification' } },
      { key: 'educationDetail',    label: 'Qualification from University', selector: 'Input[5] (visible)', action: 'fill', defaultSource: { type: 'schema', fieldKey: 'educationalQualification' } },
      { key: 'nationalityAcquired', label: 'Nationality Acquired by', selector: 'Select[4] (visible)', action: 'select', defaultSource: { type: 'schema', fieldKey: 'nationalityByBirth' } },
      { key: 'livedTwoYears',      label: 'Lived 2+ years in country?', selector: 'input[name="appl.refer_flag"][value="YES"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'YES' } },
      { key: 'passportNumber',     label: 'Passport Number',         selector: '#passport_no',          action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'passportNumber' } },
      { key: 'passportPlaceOfIssue', label: 'Place of Issue (Passport)', selector: '#passport_issue_place', action: 'fill', defaultSource: { type: 'schema', fieldKey: 'passportPlaceOfIssue' } },
      { key: 'passportIssued',     label: 'Date of Issue (Passport)', selector: '#passport_issue_date',  action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'passportIssued' } },
      { key: 'passportExpiry',     label: 'Date of Expiry (Passport)', selector: '#passport_expiry_date', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'passportExpiry' } },
      { key: 'otherPassportFlag',  label: 'Hold other Passport/IC?', selector: 'input[name="appl.oth_ppt"]', action: 'click', defaultSource: { type: 'schema', fieldKey: 'hasOtherPassport' } },
      { key: 'otherPassportNumber', label: 'Other Passport Number',  selector: '#other_ppt_no',         action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'otherPassportNumber' } },
      { key: 'otherPassportCountryOfIssue', label: 'Other Passport Country of Issue', selector: 'Select (dynamic)', action: 'select', defaultSource: { type: 'schema', fieldKey: 'passportCountryOfIssue' } },
      { key: 'otherPassportNationality', label: 'Other Passport Nationality',     selector: 'Select (dynamic)', action: 'select', defaultSource: { type: 'schema', fieldKey: 'passportCountryOfIssue' } },
      { key: 'otherPassportDateOfIssue', label: 'Other Passport Date of Issue',   selector: '#other_ppt_issue_date',  action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'otherPassportDateOfIssue' } },
      { key: 'otherPassportPlaceOfIssue', label: 'Other Passport Place of Issue', selector: '#other_ppt_issue_place', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'otherPassportPlaceOfIssue' } },
    ],
  },
  {
    key: 'addressFamily',
    label: 'Step 3 — Address & Family',
    description: 'Present address, parents, marital status, employment.',
    fields: [
      { key: 'addrLine1',          label: 'House No./Street',        selector: '#pres_add1',            action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'address' } },
      { key: 'city',               label: 'Village/Town/City',       selector: '#pres_add2',            action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'city' } },
      { key: 'residenceCountry',   label: 'Country',                 selector: '#pres_country',         action: 'select', defaultSource: { type: 'schema', fieldKey: 'residenceCountry' } },
      { key: 'state',              label: 'State/Province',          selector: '#pres_add3',            action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'state' } },
      { key: 'zip',                label: 'Postal/Zip Code',         selector: '#pincode',              action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'zip' } },
      { key: 'phone',              label: 'Phone',                   selector: '#pres_phone',           action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'phoneNumber' } },
      { key: 'mobile',             label: 'Mobile',                  selector: '#mobile',               action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'phoneNumber' } },
      { key: 'permanentSameCheck', label: 'Permanent = Present Addr', selector: 'input[type="checkbox"]', action: 'check', defaultSource: { type: 'hardcoded', value: 'true' } },
      { key: 'fatherName',         label: "Father's Name",           selector: '#fthrname',             action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'fatherName' } },
      { key: 'fatherBirthplace',   label: "Father's Place of Birth", selector: '#father_place_of_birth', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'fatherPlaceOfBirth' } },
      { key: 'fatherNationality',  label: "Father's Nationality",    selector: '#father_nationality',   action: 'select', defaultSource: { type: 'schema', fieldKey: 'fatherNationality' } },
      { key: 'fatherCountryOfBirth', label: "Father's Country of Birth", selector: '#father_country_of_birth', action: 'select', defaultSource: { type: 'schema', fieldKey: 'fatherCountryOfBirth' } },
      { key: 'motherName',         label: "Mother's Name",           selector: '#mother_name',          action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'motherName' } },
      { key: 'motherBirthplace',   label: "Mother's Place of Birth", selector: '#mother_place_of_birth', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'motherPlaceOfBirth' } },
      { key: 'motherNationality',  label: "Mother's Nationality",    selector: '#mother_nationality',   action: 'select', defaultSource: { type: 'schema', fieldKey: 'motherNationality' } },
      { key: 'motherCountryOfBirth', label: "Mother's Country of Birth", selector: '#mother_country_of_birth', action: 'select', defaultSource: { type: 'schema', fieldKey: 'motherCountryOfBirth' } },
      { key: 'maritalStatus',      label: 'Marital Status',          selector: '#marital_status',       action: 'select', defaultSource: { type: 'schema', fieldKey: 'maritalStatus' } },
      { key: 'parentsFromPakistan', label: 'Parents/Grandparents Pakistan Nationals?', selector: '#grandparent_flag2', action: 'click', defaultSource: { type: 'hardcoded', value: 'NO' } },
      { key: 'occupation',         label: 'Occupation/Employment',   selector: '#occupation',           action: 'select', defaultSource: { type: 'schema', fieldKey: 'employmentStatus' } },
      { key: 'employerName',       label: 'Employer Name',           selector: '#empname',              action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'employerName' } },
      { key: 'designation',        label: 'Designation',             selector: '#empdesignation',       action: 'fill',   defaultSource: { type: 'hardcoded', value: 'NA' } },
      { key: 'employerAddress',    label: 'Employer Address',        selector: '#empaddress',           action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'employerAddress' } },
      { key: 'militaryFlag',       label: 'Served in Military/Police?', selector: '#prev_org2',         action: 'click',  defaultSource: { type: 'hardcoded', value: 'NO' } },
    ],
  },
  {
    key: 'visaDetails',
    label: 'Step 4 — Visa Details',
    description: 'Travel plans + Indian/home references.',
    fields: [
      { key: 'placesToVisit',      label: 'Places to be Visited',    selector: '#placesToBeVisited1_id', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'placesToVisit' } },
      { key: 'exitPort',           label: 'Port of Exit',            selector: '#exitpoint',            action: 'select', defaultSource: { type: 'schema', fieldKey: 'exitPort' } },
      { key: 'visitedIndiaBefore', label: 'Visited India before?',   selector: 'input[name*="visited"]', action: 'click',  defaultSource: { type: 'schema', fieldKey: 'visitedIndiaBefore' } },
      { key: 'visaRefusedBefore',  label: 'Visa refused before?',    selector: 'input[name*="refuse"]',  action: 'click',  defaultSource: { type: 'schema', fieldKey: 'visaRefusedBefore' } },
      { key: 'bookedHotel',        label: 'Booked hotel/tour op?',   selector: '#haveYouBookedRoomInHotel_yes_id', action: 'click', defaultSource: { type: 'schema', fieldKey: 'bookedHotel' } },
      { key: 'tourOpName',         label: 'Tour Operator Name',      selector: '[id*="touroperator"][id*="name"]', action: 'fill', defaultSource: { type: 'schema', fieldKey: 'tourOperatorName' } },
      { key: 'tourOpAddr',         label: 'Tour Operator Address',   selector: '[id*="touroperator"][id*="addr"]', action: 'fill', defaultSource: { type: 'schema', fieldKey: 'tourOperatorAddress' } },
      { key: 'hotelName',          label: 'Hotel Name',              selector: '[id*="hotel"][id*="name"]',  action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'hotelName' } },
      { key: 'hotelPlace',         label: 'Hotel Place/Address',     selector: '[id*="hotel"][id*="addr"]',  action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'hotelPlace' } },
      { key: 'oldVisaFlag',        label: 'Previous visa?',          selector: '#old_visa_flag2',       action: 'click',  defaultSource: { type: 'hardcoded', value: 'NO' } },
      { key: 'refuseFlag',         label: 'Visa refused?',           selector: '#refuse_flag2',         action: 'click',  defaultSource: { type: 'hardcoded', value: 'NO' } },
      { key: 'saarcFlag',          label: 'SAARC national?',         selector: '#saarc_flag2',          action: 'click',  defaultSource: { type: 'hardcoded', value: 'NO' } },
      { key: 'refNameIndia',       label: 'Reference in India — Name', selector: '#nameofsponsor_ind',  action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refNameIndia' } },
      { key: 'refAddr1India',      label: 'Reference in India — Addr 1', selector: '#add1ofsponsor_ind', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refAddressIndia' } },
      { key: 'refAddr2India',      label: 'Reference in India — Addr 2', selector: '#add2ofsponsor_ind', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refAddressIndia' } },
      { key: 'refStateIndia',      label: 'Reference in India — State', selector: '#stateofsponsor_ind', action: 'select', defaultSource: { type: 'schema', fieldKey: 'refStateIndia' } },
      { key: 'refDistrictIndia',   label: 'Reference in India — District', selector: '#districtofsponsor_ind', action: 'select', defaultSource: { type: 'schema', fieldKey: 'refDistrictIndia' } },
      { key: 'refPhoneIndia',      label: 'Reference in India — Phone', selector: '#phoneofsponsor_ind', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refPhoneIndia' } },
      { key: 'refNameHome',        label: 'Reference at Home — Name', selector: '#nameofsponsor_msn',   action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refNameHome' } },
      { key: 'refAddr1Home',       label: 'Reference at Home — Addr 1', selector: '#add1ofsponsor_msn', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refAddressHome' } },
      { key: 'refAddr2Home',       label: 'Reference at Home — Addr 2', selector: '#add2ofsponsor_msn', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refStateHome' } },
      { key: 'refPhoneHome',       label: 'Reference at Home — Phone', selector: '#phoneofsponsor_msn', action: 'fill',   defaultSource: { type: 'schema', fieldKey: 'refPhoneHome' } },
    ],
  },
  {
    key: 'security',
    label: 'Step 5 — Security Questions',
    description: 'All "No" answers by default; declaration checkbox.',
    fields: [
      { key: 'securityRadios',     label: 'All security questions',   selector: 'input[type="radio"][value="NO"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'NO' }, hint: 'Applied to every security radio group.' },
      { key: 'declarationCheck',   label: 'Declaration Checkbox',     selector: 'input[type="checkbox"]', action: 'check', defaultSource: { type: 'hardcoded', value: 'true' } },
    ],
  },
  {
    key: 'photoUpload',
    label: 'Step 6 — Photo Upload',
    description: "Upload the traveler's passport photo.",
    fields: [
      { key: 'photo',              label: 'Photo File',              selector: 'input[type="file"]',   action: 'upload', defaultSource: { type: 'schema', fieldKey: 'photoUrl' } },
    ],
  },
  {
    key: 'photoCrop',
    label: 'Step 7 — Crop Photo',
    description: 'Manual step — customer/admin crops the photo in the browser.',
    fields: [
      { key: 'cropManual',         label: 'Crop and Save',           selector: '—',                    action: 'click',  defaultSource: { type: 'manual' } },
    ],
  },
  {
    key: 'photoPreview',
    label: 'Step 8 — Photo Preview',
    description: 'Click Save and Continue after preview.',
    fields: [
      { key: 'saveContinue',       label: 'Save and Continue',       selector: 'input[type="submit"][value="Save and Continue"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'click' } },
    ],
  },
  {
    key: 'passportDoc',
    label: 'Step 9 — Passport Document Upload',
    description: 'Upload passport bio page PDF.',
    fields: [
      { key: 'passportBio',        label: 'Passport/Bio Page PDF',   selector: 'input[type="file"]',   action: 'upload', defaultSource: { type: 'schema', fieldKey: 'passportBioUrl' } },
      { key: 'verifiedCheck',      label: 'I have verified... (checkbox)', selector: 'input[type="checkbox"]', action: 'check', defaultSource: { type: 'hardcoded', value: 'true' } },
      { key: 'confirmBtn',         label: 'Confirm',                 selector: 'input[type="submit"][value="Confirm"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'click' } },
    ],
  },
  {
    key: 'summary',
    label: 'Step 10 — Summary Review',
    description: 'Manual — human reviews the summary before confirming.',
    fields: [
      { key: 'verifiedContinue',   label: 'Verified and Continue',   selector: '—',                    action: 'click',  defaultSource: { type: 'manual' } },
    ],
  },
  {
    key: 'payment',
    label: 'Step 11 — Payment',
    description: 'Captures Application ID, chooses payment gateway, submits.',
    fields: [
      { key: 'applicationIdGrab',  label: 'Application ID (extract)', selector: 'body (regex)',        action: 'fill',   defaultSource: { type: 'hardcoded', value: 'extract' }, hint: 'Not filled — extracted from the page + saved to the order.' },
      { key: 'undertaking',        label: 'Undertaking — Agree?',    selector: 'input[type="radio"][value="YES"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'YES' } },
      { key: 'payNow',             label: 'Pay Now',                 selector: 'input[type="submit"][value="Pay Now"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'click' } },
      { key: 'gatewayPaypal',      label: 'Gateway: PayPal',         selector: 'input[type="radio"] (PayPal label)', action: 'click', defaultSource: { type: 'hardcoded', value: 'PayPal' } },
      { key: 'gatewayContinue',    label: 'Continue (to gateway)',   selector: 'input[type="submit"][value="Continue"]', action: 'click', defaultSource: { type: 'hardcoded', value: 'click' } },
    ],
  },
];

export function defaultBotMapping(country: string): BotMapping {
  return { country: country.toUpperCase(), overrides: {} };
}

export function getBotCatalog(country: string): BotStep[] {
  if (country.toUpperCase() === 'INDIA') return BUILT_IN_INDIA_BOT_STEPS;
  return [];
}

/**
 * Normalize a BotSource coming from user input (validator — untrusted).
 */
export function normaliseBotSource(v: any): BotSource | null {
  if (!v || typeof v !== 'object') return null;
  const t = v.type;
  if (t === 'skip')     return { type: 'skip' };
  if (t === 'manual')   return { type: 'manual' };
  if (t === 'schema' && typeof v.fieldKey === 'string' && v.fieldKey.trim())
    return { type: 'schema', fieldKey: v.fieldKey.trim() };
  if (t === 'hardcoded' && typeof v.value === 'string')
    return { type: 'hardcoded', value: v.value };
  return null;
}
