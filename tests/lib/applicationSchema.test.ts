import { describe, it, expect } from 'vitest';
import {
  schemaSettingKey,
  defaultSchema,
  mergeWithDefaults,
  findField,
  findSection,
  isVisibleForVisa,
  isVisibleForPurpose,
  isSectionVisible,
  BUILT_IN_INDIA_SECTIONS,
  type ApplicationSchema,
  type CustomSection,
} from '@/lib/applicationSchema';

describe('schemaSettingKey', () => {
  it('uppercases the country code', () => {
    expect(schemaSettingKey('india')).toBe('application.schema.INDIA');
    expect(schemaSettingKey('turkey')).toBe('application.schema.TURKEY');
  });
});

describe('defaultSchema', () => {
  it('returns the built-in India sections for INDIA', () => {
    const s = defaultSchema('india');
    expect(s.country).toBe('INDIA');
    expect(s.sections).toBe(BUILT_IN_INDIA_SECTIONS);
  });

  it('returns an empty sections array for unknown countries', () => {
    const s = defaultSchema('turkey');
    expect(s.country).toBe('TURKEY');
    expect(s.sections).toEqual([]);
  });
});

describe('BUILT_IN_INDIA_SECTIONS integrity', () => {
  it('has unique section keys', () => {
    const keys = BUILT_IN_INDIA_SECTIONS.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has unique field keys within each section', () => {
    for (const sec of BUILT_IN_INDIA_SECTIONS) {
      const keys = sec.fields.map(f => f.key);
      expect(new Set(keys).size, `duplicate field keys in section ${sec.key}`).toBe(keys.length);
    }
  });

  it('every section is marked builtIn', () => {
    for (const sec of BUILT_IN_INDIA_SECTIONS) expect(sec.builtIn).toBe(true);
  });
});

describe('mergeWithDefaults — null / missing input', () => {
  it('returns defaults when stored is null', () => {
    expect(mergeWithDefaults(null, 'INDIA')).toEqual(defaultSchema('INDIA'));
  });

  it('returns defaults when stored has no sections array', () => {
    expect(mergeWithDefaults({} as any, 'INDIA')).toEqual(defaultSchema('INDIA'));
  });
});

describe('mergeWithDefaults — admin overrides on built-ins', () => {
  it('renames a built-in label without losing other fields', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal (renamed)',
          builtIn: true,
          fields: [{ key: 'firstName', label: 'Given name', type: 'text', builtIn: true }],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const personal = findSection(merged, 'personal')!;
    expect(personal.title).toBe('Personal (renamed)');
    const fn = findField(merged, 'personal', 'firstName')!;
    expect(fn.label).toBe('Given name');
    // lastName still exists — default preserved
    expect(findField(merged, 'personal', 'lastName')).toBeDefined();
  });

  it('preserves immutable attrs (type, key, builtIn) even if override tries to change them', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [
            // Admin tries to sneak in a type change — should be ignored
            { key: 'firstName', label: 'Given', type: 'number' as any, builtIn: true },
          ],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const fn = findField(merged, 'personal', 'firstName')!;
    expect(fn.type).toBe('text'); // default, not the sneaky "number"
  });

  it('lets admins toggle required and hidden flags', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [
            { key: 'firstName', label: 'First name', type: 'text', builtIn: true, required: false, hidden: true },
          ],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const fn = findField(merged, 'personal', 'firstName')!;
    expect(fn.required).toBe(false);
    expect(fn.hidden).toBe(true);
  });

  it('keeps default options when override provides none', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [{ key: 'gender', label: 'Gender', type: 'select', builtIn: true }],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const g = findField(merged, 'personal', 'gender')!;
    expect(g.options).toEqual(['Male', 'Female', 'Other']);
  });

  it('uses override options when admin provides a non-empty list', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [
            { key: 'gender', label: 'Gender', type: 'select', builtIn: true, options: ['M', 'F', 'Other', 'Prefer not to say'] },
          ],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const g = findField(merged, 'personal', 'gender')!;
    expect(g.options).toEqual(['M', 'F', 'Other', 'Prefer not to say']);
  });
});

describe('mergeWithDefaults — custom sections and fields', () => {
  it('appends admin-added custom sections after built-ins', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'custom_biz',
          title: 'Extra Business Questions',
          fields: [{ key: 'companySize', label: 'Company size', type: 'text' }],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    // Built-ins still at front
    expect(merged.sections[0].key).toBe('visa_selection');
    // Custom at the end
    expect(merged.sections[merged.sections.length - 1].key).toBe('custom_biz');
  });

  it('appends custom fields admin added to a built-in section', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [{ key: 'nickname', label: 'Nickname', type: 'text' }], // no builtIn flag — custom
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const personal = findSection(merged, 'personal')!;
    // All built-in fields still present
    expect(personal.fields.find(f => f.key === 'firstName')).toBeDefined();
    expect(personal.fields.find(f => f.key === 'lastName')).toBeDefined();
    // Custom nickname appended
    expect(personal.fields.find(f => f.key === 'nickname')).toBeDefined();
  });
});

describe('mergeWithDefaults — reordering', () => {
  it('respects stored ordering of built-in sections', () => {
    // Default starts with visa_selection; admin moves address before personal.
    const stored: Partial<ApplicationSchema> = {
      sections: [
        { key: 'address', title: 'Home Address', builtIn: true, fields: [] } as CustomSection,
        { key: 'personal', title: 'Personal', builtIn: true, fields: [] } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const addrIdx = merged.sections.findIndex(s => s.key === 'address');
    const persIdx = merged.sections.findIndex(s => s.key === 'personal');
    expect(addrIdx).toBeLessThan(persIdx);
    // New built-ins not in stored order are still appended
    expect(findSection(merged, 'documents')).toBeDefined();
  });

  it('respects stored ordering of fields within a section', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [
            { key: 'lastName', label: 'Last', type: 'text', builtIn: true },
            { key: 'firstName', label: 'First', type: 'text', builtIn: true },
          ],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const personal = findSection(merged, 'personal')!;
    const lastIdx = personal.fields.findIndex(f => f.key === 'lastName');
    const firstIdx = personal.fields.findIndex(f => f.key === 'firstName');
    expect(lastIdx).toBeLessThan(firstIdx);
  });
});

describe('isVisibleForVisa', () => {
  it('returns true when no visa-type restriction is set', () => {
    expect(isVisibleForVisa(undefined, 'BUSINESS_1Y')).toBe(true);
    expect(isVisibleForVisa([], 'BUSINESS_1Y')).toBe(true);
    expect(isVisibleForVisa([], undefined)).toBe(true);
  });

  it('returns true only when visaType is in the allow-list', () => {
    expect(isVisibleForVisa(['BUSINESS_1Y'], 'BUSINESS_1Y')).toBe(true);
    expect(isVisibleForVisa(['BUSINESS_1Y'], 'TOURIST_30')).toBe(false);
    expect(isVisibleForVisa(['BUSINESS_1Y', 'MEDICAL_60'], 'MEDICAL_60')).toBe(true);
    expect(isVisibleForVisa(['BUSINESS_1Y', 'MEDICAL_60'], 'TOURIST_30')).toBe(false);
  });

  it('returns true when visaType is undefined (admin previews fall through to "show")', () => {
    expect(isVisibleForVisa(['BUSINESS_1Y'], undefined)).toBe(true);
  });
});

describe('isVisibleForPurpose', () => {
  it('returns true when no purpose restriction is set', () => {
    expect(isVisibleForPurpose(undefined, 'Attend Technical/Business Meetings')).toBe(true);
    expect(isVisibleForPurpose([], 'Attend Technical/Business Meetings')).toBe(true);
  });

  it('returns true only when purpose is in the allow-list', () => {
    expect(isVisibleForPurpose(['Attend Technical/Business Meetings'], 'Attend Technical/Business Meetings')).toBe(true);
    expect(isVisibleForPurpose(['Attend Technical/Business Meetings'], 'Recruit Manpower')).toBe(false);
    expect(isVisibleForPurpose(['Recruit Manpower', 'Conducting Tours'], 'Conducting Tours')).toBe(true);
  });

  it('returns true when purpose is undefined (be lenient)', () => {
    expect(isVisibleForPurpose(['Attend Technical/Business Meetings'], undefined)).toBe(true);
  });
});

describe('isSectionVisible — compound visa + purpose check', () => {
  const meetingsOnly = {
    visibleForVisaTypes: ['BUSINESS_1Y'],
    visibleForPurposes: ['Attend Technical/Business Meetings'],
  };

  it('passes only when BOTH visa and purpose match', () => {
    expect(isSectionVisible(meetingsOnly, { visaType: 'BUSINESS_1Y', purposeOfVisit: 'Attend Technical/Business Meetings' })).toBe(true);
  });

  it('fails when visa matches but purpose differs', () => {
    expect(isSectionVisible(meetingsOnly, { visaType: 'BUSINESS_1Y', purposeOfVisit: 'Recruit Manpower' })).toBe(false);
  });

  it('fails when purpose matches but visa differs', () => {
    expect(isSectionVisible(meetingsOnly, { visaType: 'TOURIST_30', purposeOfVisit: 'Attend Technical/Business Meetings' })).toBe(false);
  });

  it('passes when there are no restrictions at all', () => {
    expect(isSectionVisible({ visibleForVisaTypes: undefined, visibleForPurposes: undefined }, { visaType: 'TOURIST_30' })).toBe(true);
  });

  it('passes a visa-only restriction without a purpose context', () => {
    expect(isSectionVisible({ visibleForVisaTypes: ['BUSINESS_1Y'] }, { visaType: 'BUSINESS_1Y' })).toBe(true);
  });
});

describe('built-in business_meetings_details section', () => {
  it('exists in the catalog with BUSINESS_1Y + Attend Technical/Business Meetings restriction', () => {
    const def = BUILT_IN_INDIA_SECTIONS.find(s => s.key === 'business_meetings_details');
    expect(def).toBeDefined();
    expect(def!.visibleForVisaTypes).toEqual(['BUSINESS_1Y']);
    expect(def!.visibleForPurposes).toEqual(['Attend Technical/Business Meetings']);
    expect(def!.builtIn).toBe(true);
    expect(def!.fields.map(f => f.key)).toEqual([
      'applicantCompanyName', 'applicantCompanyAddress', 'applicantCompanyPhone', 'applicantCompanyWebsite',
      'indianFirmName', 'indianFirmAddress', 'indianFirmPhone', 'indianFirmWebsite',
    ]);
  });

  it('all 8 fields are required', () => {
    const def = BUILT_IN_INDIA_SECTIONS.find(s => s.key === 'business_meetings_details')!;
    for (const f of def.fields) expect(f.required).toBe(true);
  });

  it('isSectionVisible respects the compound restriction', () => {
    const def = BUILT_IN_INDIA_SECTIONS.find(s => s.key === 'business_meetings_details')!;
    expect(isSectionVisible(def, { visaType: 'BUSINESS_1Y', purposeOfVisit: 'Attend Technical/Business Meetings' })).toBe(true);
    expect(isSectionVisible(def, { visaType: 'BUSINESS_1Y', purposeOfVisit: 'Recruit Manpower' })).toBe(false);
    expect(isSectionVisible(def, { visaType: 'TOURIST_30',  purposeOfVisit: 'Attend Technical/Business Meetings' })).toBe(false);
  });
});

describe('mergeWithDefaults — visibleForVisaTypes preservation', () => {
  it('preserves the built-in default when admin doesn\'t override', () => {
    const merged = mergeWithDefaults(null, 'INDIA');
    const biz = findSection(merged, 'business_meetings_details')!;
    expect(biz.visibleForVisaTypes).toEqual(['BUSINESS_1Y']);
    expect(biz.visibleForPurposes).toEqual(['Attend Technical/Business Meetings']);
  });

  it('lets admin override the visa-type restriction (e.g. open to all)', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'business_meetings_details',
          title: 'Business Meeting Details',
          builtIn: true,
          visibleForVisaTypes: undefined,  // admin removed restriction
          fields: [],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const biz = findSection(merged, 'business_meetings_details')!;
    // ?? falls through to default when override is undefined
    expect(biz.visibleForVisaTypes).toEqual(['BUSINESS_1Y']);
  });

  it('preserves visibleForPurposes through the merge round-trip', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'family',
          title: 'Family',
          builtIn: true,
          visibleForPurposes: ['Recruit Manpower'],
          fields: [],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const family = findSection(merged, 'family')!;
    expect(family.visibleForPurposes).toEqual(['Recruit Manpower']);
  });

  it('honors explicit narrower visa restrictions', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'family',
          title: 'Family',
          builtIn: true,
          visibleForVisaTypes: ['BUSINESS_1Y', 'MEDICAL_60'],
          fields: [],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const family = findSection(merged, 'family')!;
    expect(family.visibleForVisaTypes).toEqual(['BUSINESS_1Y', 'MEDICAL_60']);
  });
});

describe('mergeWithDefaults — tombstones (deletedBuiltIns)', () => {
  it('drops a built-in section whose key is in deletedBuiltIns', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [],
      deletedBuiltIns: ['accommodation'],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    expect(findSection(merged, 'accommodation')).toBeUndefined();
    // Other built-ins still present
    expect(findSection(merged, 'passport')).toBeDefined();
  });

  it('drops a built-in field whose section.field key is in deletedBuiltIns', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [],
      deletedBuiltIns: ['passport.otherPassportNumber'],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    expect(findField(merged, 'passport', 'otherPassportNumber')).toBeUndefined();
    // Other passport fields still present
    expect(findField(merged, 'passport', 'passportNumber')).toBeDefined();
  });

  it('combines section + field tombstones independently', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [],
      deletedBuiltIns: ['family', 'personal.firstName'],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    expect(findSection(merged, 'family')).toBeUndefined();      // whole section gone
    expect(findSection(merged, 'personal')).toBeDefined();      // section still there
    expect(findField(merged, 'personal', 'firstName')).toBeUndefined();  // but field gone
    expect(findField(merged, 'personal', 'lastName')).toBeDefined();      // sibling intact
  });

  it('persists the tombstones array through merge', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [],
      deletedBuiltIns: ['accommodation', 'family'],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    expect(merged.deletedBuiltIns).toEqual(['accommodation', 'family']);
  });

  it('omits deletedBuiltIns from output when empty', () => {
    const merged = mergeWithDefaults({ sections: [], deletedBuiltIns: [] }, 'INDIA');
    expect(merged.deletedBuiltIns).toBeUndefined();
  });

  it('ignores non-array deletedBuiltIns values', () => {
    const merged = mergeWithDefaults({ sections: [], deletedBuiltIns: 'not-an-array' as any }, 'INDIA');
    expect(merged.deletedBuiltIns).toBeUndefined();
    expect(findSection(merged, 'passport')).toBeDefined();
  });

  it('a tombstoned section + admin override of the same section: tombstone wins', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        { key: 'accommodation', title: 'Where you stay', builtIn: true, fields: [] } as CustomSection,
      ],
      deletedBuiltIns: ['accommodation'],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    // Even though admin renamed it, the tombstone wipes the section.
    expect(findSection(merged, 'accommodation')).toBeUndefined();
  });
});

describe('mergeWithDefaults — pages trait immutability', () => {
  it('ignores admin override of pages on built-in sections', () => {
    const stored: Partial<ApplicationSchema> = {
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          pages: ['finish'], // admin tries to remove 'apply'
          fields: [],
        } as CustomSection,
      ],
    };
    const merged = mergeWithDefaults(stored, 'INDIA');
    const personal = findSection(merged, 'personal')!;
    expect(personal.pages).toEqual(['apply', 'finish']);
  });
});

describe('findField / findSection', () => {
  const schema = defaultSchema('INDIA');

  it('findSection returns the section when present', () => {
    expect(findSection(schema, 'passport')?.key).toBe('passport');
  });

  it('findSection returns undefined when not present', () => {
    expect(findSection(schema, 'nonexistent')).toBeUndefined();
  });

  it('findField returns the field when present', () => {
    expect(findField(schema, 'passport', 'passportNumber')?.key).toBe('passportNumber');
  });

  it('findField returns undefined when missing', () => {
    expect(findField(schema, 'passport', 'nonexistent')).toBeUndefined();
    expect(findField(schema, 'nonexistent', 'firstName')).toBeUndefined();
  });
});
