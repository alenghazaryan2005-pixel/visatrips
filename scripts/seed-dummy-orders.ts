/**
 * Seed dummy orders for testing the admin panel.
 * Usage: npx tsx scripts/seed-dummy-orders.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Helper to build a traveler object
function makeTraveler(overrides: any = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    dob: 'January 15, 1990',
    gender: 'Female',
    maritalStatus: 'Single',
    religion: 'Christianity',
    countryOfBirth: 'United States',
    cityOfBirth: 'New York',
    citizenshipId: 'NA',
    nationalityByBirth: 'birth',
    livedTwoYears: 'yes',
    parentsFromPakistan: 'no',
    visibleMarks: '',
    educationalQualification: 'Graduate',
    phoneNumber: '12125551234',
    address: '123 Main Street',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    residenceCountry: 'United States',
    employmentStatus: 'Employed',
    employerName: 'Acme Corp',
    employerAddress: '456 Business Ave',
    employerCity: 'New York',
    employerState: 'NY',
    employerCountry: 'United States',
    employerZip: '10002',
    servedMilitary: 'no',
    fatherName: 'John Doe',
    fatherNationality: 'United States',
    fatherPlaceOfBirth: 'Boston',
    fatherCountryOfBirth: 'United States',
    motherName: 'Mary Doe',
    motherNationality: 'United States',
    motherPlaceOfBirth: 'Chicago',
    motherCountryOfBirth: 'United States',
    passportCountry: 'United States',
    passportNumber: 'P12345678',
    passportPlaceOfIssue: 'New York',
    passportCountryOfIssue: 'United States',
    passportIssued: 'January 15, 2020',
    passportExpiry: 'January 15, 2030',
    hasOtherPassport: 'no',
    arrivalDate: 'June 10, 2026',
    arrivalPoint: 'Delhi (Airport)',
    hasConfirmedTravel: 'yes',
    placesToVisit: 'Delhi, Agra, Mumbai',
    bookedHotel: 'no',
    exitPort: 'Delhi (Airport)',
    visitedIndiaBefore: 'no',
    visaRefusedBefore: 'no',
    refNameIndia: 'Delhi Tours',
    refAddressIndia: 'Connaught Place',
    refStateIndia: 'DELHI',
    refDistrictIndia: 'NEW DELHI',
    refPhoneIndia: '919876543210',
    refNameHome: 'Sarah Smith',
    refAddressHome: '789 Oak Ave',
    refStateHome: 'NY',
    refDistrictHome: '10003',
    refPhoneHome: '12125555678',
    everArrested: 'no',
    everRefusedEntry: 'no',
    soughtAsylum: 'no',
    hasCriminalRecord: 'no',
    finishStep: 'complete',
    ...overrides,
  };
}

const DUMMY_ORDERS = [
  // 1. Just paid — hasn't started the finish page
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    status: 'UNFINISHED' as const,
    billingEmail: 'emma.wilson@example.com',
    travelers: [makeTraveler({
      firstName: 'Emma',
      lastName: 'Wilson',
      email: 'emma.wilson@example.com',
      phoneNumber: '14155551234',
      // finishStep undefined — she hasn't finished anything
      finishStep: undefined,
    })],
    cardLast4: '4242',
    processingSpeed: 'standard',
  },

  // 2. Completed finish page — needs our review
  {
    destination: 'India',
    visaType: 'TOURIST_1Y',
    totalUSD: 71.25,
    status: 'PROCESSING' as const,
    billingEmail: 'michael.chen@example.com',
    travelers: [makeTraveler({
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@example.com',
      phoneNumber: '16175559876',
      countryOfBirth: 'Taiwan',
      cityOfBirth: 'Taipei',
      passportCountry: 'United States',
      passportNumber: 'P87654321',
    })],
    cardLast4: '5555',
    processingSpeed: 'rush',
  },

  // 3. We flagged fields — waiting on customer
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    status: 'NEEDS_CORRECTION' as const,
    billingEmail: 'raj.patel@example.com',
    travelers: [makeTraveler({
      firstName: 'Raj',
      lastName: 'Patel',
      email: 'raj.patel@example.com',
      phoneNumber: '15125551122',
      countryOfBirth: 'India',
      cityOfBirth: 'Mumbai',
      passportCountry: 'United States',
      passportNumber: 'P55443322',
      passportExpiry: 'March 1, 2026', // expires too close!
    })],
    flaggedFields: JSON.stringify(['passportExpiry', 'photoUrl']),
    specialistNotes: 'Your passport expires less than 6 months from your travel date. Please upload a current passport OR adjust your travel date. Photo also needs to be re-uploaded — current one is too small.',
    cardLast4: '1234',
    processingSpeed: 'standard',
  },

  // 4. Submitted to gov, got application ID
  {
    destination: 'India',
    visaType: 'BUSINESS_1Y',
    totalUSD: 101.25,
    status: 'SUBMITTED' as const,
    billingEmail: 'sarah.johnson@example.com',
    travelers: [makeTraveler({
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@example.com',
      phoneNumber: '12025554433',
      employmentStatus: 'Employed',
      employerName: 'Johnson Consulting LLC',
    })],
    applicationId: 'I032V04C6B26',
    cardLast4: '9999',
    processingSpeed: 'super',
  },

  // 5. Completed — visa delivered
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    status: 'COMPLETED' as const,
    billingEmail: 'david.kim@example.com',
    travelers: [makeTraveler({
      firstName: 'David',
      lastName: 'Kim',
      email: 'david.kim@example.com',
      phoneNumber: '13105559988',
      countryOfBirth: 'Republic of Korea',
      cityOfBirth: 'Seoul',
    })],
    applicationId: 'B421V02C9X11',
    evisaUrl: '/uploads/dummy-evisa.pdf',
    cardLast4: '2468',
    processingSpeed: 'standard',
    completedAt: new Date(),
  },

  // 6. On hold — manually paused
  {
    destination: 'India',
    visaType: 'MEDICAL_60',
    totalUSD: 61.25,
    status: 'ON_HOLD' as const,
    billingEmail: 'lisa.taylor@example.com',
    travelers: [makeTraveler({
      firstName: 'Lisa',
      lastName: 'Taylor',
      email: 'lisa.taylor@example.com',
      phoneNumber: '17035551111',
      employmentStatus: 'Retired',
      employerName: 'NA',
    })],
    notes: 'Customer requested we pause processing while they finalize medical travel plans. Resume after confirming with them.',
    cardLast4: '1357',
    processingSpeed: 'rush',
  },

  // 7. Refunded
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    status: 'REFUNDED' as const,
    billingEmail: 'alex.rivera@example.com',
    travelers: [makeTraveler({
      firstName: 'Alex',
      lastName: 'Rivera',
      email: 'alex.rivera@example.com',
      phoneNumber: '13055557777',
    })],
    refundAmount: 51.25,
    refundReason: 'Customer changed travel plans — full refund issued.',
    refundedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    cardLast4: '8080',
    processingSpeed: 'standard',
  },

  // 8. Rejected
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    status: 'REJECTED' as const,
    billingEmail: 'tom.brown@example.com',
    travelers: [makeTraveler({
      firstName: 'Tom',
      lastName: 'Brown',
      email: 'tom.brown@example.com',
      phoneNumber: '18595554444',
      everRefusedEntry: 'yes',
    })],
    applicationId: 'R119V01C3Y77',
    notes: 'Indian government rejected application. Customer has previous refused entry history from 2019.',
    cardLast4: '6666',
    processingSpeed: 'standard',
  },

  // 9. Multi-traveler family order
  {
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 153.75, // 3 travelers × $51.25
    status: 'PROCESSING' as const,
    billingEmail: 'robert.martinez@example.com',
    travelers: [
      makeTraveler({
        firstName: 'Robert',
        lastName: 'Martinez',
        email: 'robert.martinez@example.com',
        phoneNumber: '12135551212',
        spouseName: 'Maria Martinez',
        spouseNationality: 'United States',
      }),
      makeTraveler({
        firstName: 'Maria',
        lastName: 'Martinez',
        email: 'robert.martinez@example.com',
        dob: 'June 5, 1988',
        gender: 'Female',
        phoneNumber: '12135551213',
        passportNumber: 'P99887766',
        spouseName: 'Robert Martinez',
      }),
      makeTraveler({
        firstName: 'Sofia',
        lastName: 'Martinez',
        email: 'robert.martinez@example.com',
        dob: 'August 22, 2015',
        gender: 'Female',
        phoneNumber: '12135551212',
        passportNumber: 'P11223344',
        maritalStatus: 'Single',
      }),
    ],
    cardLast4: '3333',
    processingSpeed: 'rush',
  },

  // 10. Unfinished + reminder sent
  {
    destination: 'India',
    visaType: 'TOURIST_5Y',
    totalUSD: 91.25,
    status: 'UNFINISHED' as const,
    billingEmail: 'anna.schmidt@example.com',
    travelers: [makeTraveler({
      firstName: 'Anna',
      lastName: 'Schmidt',
      email: 'anna.schmidt@example.com',
      phoneNumber: '49123456789',
      countryOfBirth: 'Germany',
      residenceCountry: 'Germany',
      passportCountry: 'Germany',
      finishStep: undefined,
    })],
    reminderCount: 1,
    lastReminderAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    cardLast4: '7777',
    processingSpeed: 'standard',
  },
];

async function seed() {
  console.log('🌱 Seeding dummy orders...\n');
  let created = 0;

  for (const order of DUMMY_ORDERS) {
    const travelersJson = JSON.stringify(order.travelers);
    const data: any = {
      destination: order.destination,
      visaType: order.visaType,
      totalUSD: order.totalUSD,
      status: order.status,
      billingEmail: order.billingEmail,
      travelers: travelersJson,
      cardLast4: (order as any).cardLast4,
      processingSpeed: (order as any).processingSpeed,
      notes: (order as any).notes,
      applicationId: (order as any).applicationId,
      evisaUrl: (order as any).evisaUrl,
      flaggedFields: (order as any).flaggedFields,
      specialistNotes: (order as any).specialistNotes,
      refundAmount: (order as any).refundAmount,
      refundReason: (order as any).refundReason,
      refundedAt: (order as any).refundedAt,
      completedAt: (order as any).completedAt,
      reminderCount: (order as any).reminderCount,
      lastReminderAt: (order as any).lastReminderAt,
    };
    // Strip undefined
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    const saved = await prisma.order.create({ data });
    console.log(`✅ #${String(saved.orderNumber).padStart(5, '0')} — ${order.status.padEnd(17)} — ${order.travelers[0].firstName} ${order.travelers[0].lastName} (${order.billingEmail})`);
    created++;
  }

  console.log(`\n🎉 Created ${created} dummy orders!\n`);
  await prisma.$disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
