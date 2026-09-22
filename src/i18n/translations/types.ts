/**
 * Shape of every interface dictionary. Every locale file must satisfy this
 * exactly — TypeScript will flag a locale file that's missing a key or has
 * an extra one, so translations can never silently drift out of sync.
 */
export interface Dictionary {
  nav: {
    wall: string;
    about: string;
    writeThought: string;
    myMindot: string;
    admin: string;
  };
  hero: {
    badge: string;
    heading: string;
    headingHighlight: string;
    description: string;
    primaryCta: string;
    /** Trailing text after the real, live active-message count — see app/page.tsx. The number itself is formatted, not translated. */
    activeCountLabel: string;
    /** Small eyebrow caption directly under the hero's 4 note cards (HeroBrandComposition) — these are real top-liked messages (see listTopLikedApproved), and this label names that. */
    topLikedLabel: string;
  };
  homeInfoBand: {
    col1Line1: string;
    col1Highlight: string;
    col2Line1: string;
    col2Highlight: string;
    col3Line1: string;
    col3Highlight: string;
    col4Line1: string;
    col4Highlight: string;
  };
  /** Reused by /about — see AboutPageContent — not duplicated under a second key. */
  story: {
    badge: string;
    heading: string;
    paragraphs: [string, string, string, string];
  };
  /**
   * EPIC 036: the real physical Pano photos on /about — a distinct section
   * from `story` above. `story` is MINDOT's existing abstract origin
   * narrative (the Kayseri market board, 1984-1994); `panoStory` presents
   * the actual archival photographs as supporting evidence, so the two
   * stay separate keys rather than merging into one. `closing` intentionally
   * has no final tagline field — the section reuses `boardPage.slogan`
   * ("Aklında kalmasın.") rather than duplicating that string a third time.
   */
  panoStory: {
    heading: string;
    lead: string;
    paragraphs: [string, string, string];
    origin: string;
    closing: string;
    photoAlt: [string, string, string];
  };
  footer: {
    tagline: string;
    privacy: string;
    terms: string;
    guidelines: string;
    /** i18n audit: accessible name for the footer's legal-links `<nav>` landmark (SiteFooter.tsx) — previously a hardcoded "Legal". */
    legalNavLabel: string;
  };
  common: {
    language: string;
    signedInAs: string;
    signOut: string;
    adminSectionsLabel: string;
    /** EPIC 022: accessible trailing word after a numeric AdminNav badge count (e.g. "5 pending") — the visible digit is aria-hidden, this is what a screen reader actually announces alongside it. Reused for both the Moderation (pending messages) and Reports (open reports) badges rather than two separate words. */
    adminNavPendingCountLabel: string;
    /** i18n audit: accessible name for the header's primary `<nav>` landmark (SiteHeader.tsx) — previously a hardcoded "Primary". */
    primaryNavLabel: string;
  };
  write: {
    title: string;
    subtitle: string;
    contentLabel: string;
    contentPlaceholder: string;
    characterCount: string;
    templateLabel: string;
    templateStandardLabel: string;
    templateOccasionLabel: string;
    /** EPIC 039: category chip labels for the "Bir not seç" category + horizontal-rail picker. "Standard"/"Special occasions" reuse the two keys above — these are the two new categories. */
    templateCategoryAllLabel: string;
    templateCategorySportsLabel: string;
    /** EPIC 039: accessible names for each category rail's scroll buttons. */
    templateRailPrevLabel: string;
    templateRailNextLabel: string;
    /**
     * EPIC 039: builds a sports card's `aria-label` — the only place a
     * sports template's identity is ever described to anyone, since no
     * team name/logo ever appears in the UI. Contains the literal tokens
     * `{primary}`/`{secondary}` (and, for the one three-color entry,
     * `{accent}`; safe to leave unreplaced/unused for a two-color card),
     * replaced with the matching `sportsColorNames` word below — e.g.
     * "Sports card — yellow and red".
     */
    sportsCardAriaLabel: string;
    /** EPIC 039: the closed `SportsColorKey` vocabulary (see features/notes/types.ts), translated — used only to build `sportsCardAriaLabel` above, never shown as standalone UI text. */
    sportsColorNames: Record<
      "yellow" | "red" | "navy" | "black" | "white" | "green" | "maroon" | "blue" | "orange" | "purple",
      string
    >;
    /**
     * i18n audit: a sports/football template's own display name — shown
     * outside the picker itself (moderation queue, private archive), where
     * `sportsCardAriaLabel`'s full sentence would be too long. Composed by
     * `features/notes/lib/templateDisplayName.ts` as
     * "{sportsCardNamePrefix} — {color} & {color}" from `sportsColorNames`,
     * the same color vocabulary `sportsCardAriaLabel` already uses — never a
     * second, separately-translated set of "Football — X & Y" strings.
     */
    sportsCardNamePrefix: string;
    /**
     * i18n audit: display names for every non-sports note template
     * (standard + seasonal, `features/notes/config/templates.ts`), keyed by
     * template id — read via `templateDisplayName()`, never
     * `template.name` directly. A template id missing here falls back to
     * its registry `name` (English) rather than breaking, so registering a
     * new template never requires a synchronized 5-locale dictionary update
     * before it can ship.
     */
    templateNames: Record<string, string>;
    /** EPIC — Kart Yazı Tipi Seçenekleri: "Yazı tipi" heading + the four pill button labels (each button also renders in its own font — see WriteThoughtForm.tsx). */
    fontFamilyLabel: string;
    fontModernLabel: string;
    fontClassicLabel: string;
    fontHandwrittenLabel: string;
    fontTypewriterLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    anonymousLabel: string;
    languageLabel: string;
    previewLabel: string;
    previewAuthorFallback: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
    errorEmpty: string;
    errorTooLong: string;
    errorGeneric: string;
    signInRequired: string;
    identityHeading: string;
    identityNamedLabel: string;
    identityAnonymousHint: string;
    identityNamedHint: string;
    writeAnotherButton: string;
    /** Primary action on the post-submit success card — routes to /me/archive so the author can find this thought again without searching the board. */
    viewMyThoughtsAction: string;
    trustNote: string;
    /** Mandatory content-responsibility consent, shown before either the Google sign-in button or the submit button becomes clickable — see "Mandatory content-responsibility consent" in CLAUDE.md. */
    consentHeading: string;
    consentText: string;
    errorConsentRequired: string;
    /** EPIC 013: shown both proactively (a suspended writer sees this before trying to submit) and reactively (submitMessage's own server-side re-check). Never mentions a reason — see CLAUDE.md's "User UX" section. */
    errorAccountSuspended: string;
    /** EPIC 018: submitMessage's server-side rate-limit rejection — a real writer composing several notes in one sitting should never see this; it's tuned for a clear velocity outlier. */
    errorRateLimited: string;
    /** EPIC 026: shown next to the disabled Continue-with-Google/Submit action so it's clear *why* it's disabled — never changes the actual requirement (content + consent), only explains it. */
    continueRequirementsContent: string;
    continueRequirementsConsent: string;
    continueRequirementsBoth: string;
  };
  invite: {
    eyebrow: string;
    heading: string;
    body: string;
    signInWithGoogle: string;
    disclaimer: string;
    invalidTitle: string;
    invalidBody: string;
    expiredTitle: string;
    expiredBody: string;
    usedTitle: string;
    usedBody: string;
    revokedTitle: string;
    revokedBody: string;
  };
  /** EPIC 030: /admin/login — the admin-only, Google-independent sign-in form. Never shown to or used by normal users; `invalidCredentials` is one deliberately generic message covering every rejection reason (wrong password, unknown username, non-admin, suspended, locked out) so the form never hints which one applied. */
  /** EPIC 036: login identity is email, not username — see AdminLoginPageContent. */
  adminLogin: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    signInButton: string;
    signingIn: string;
    invalidCredentials: string;
    errorGeneric: string;
  };
  moderation: {
    title: string;
    subtitle: string;
    pendingHeading: string;
    approvedHeading: string;
    archivedHeading: string;
    rejectedHeading: string;
    emptyPending: string;
    emptyApproved: string;
    emptyArchived: string;
    emptyRejected: string;
    approve: string;
    reject: string;
    approving: string;
    rejecting: string;
    archiveAction: string;
    archiving: string;
    restoreAction: string;
    restoring: string;
    reconsiderAction: string;
    reconsidering: string;
    archiveConfirmTitle: string;
    archiveConfirmBody: string;
    archiveConfirmCancel: string;
    archiveConfirmConfirm: string;
    /** EPIC 014: reject previously had no confirm step at all — this adds one, mirroring archiveConfirm* naming exactly. */
    rejectConfirmTitle: string;
    rejectConfirmBody: string;
    rejectConfirmCancel: string;
    rejectConfirmConfirm: string;
    /** EPIC 014: shared between the reject/archive dialogs' textarea and the card's own reason display. */
    moderationReasonLabel: string;
    moderationReasonPlaceholder: string;
    moderatorLabel: string;
    moderatedAtLabel: string;
    noModerationReason: string;
    statusPending: string;
    statusApproved: string;
    statusRejected: string;
    statusArchived: string;
    submittedLabel: string;
    invitationLabel: string;
    noInvitation: string;
    templateLabel: string;
    unauthorizedTitle: string;
    unauthorizedBody: string;
    errorGeneric: string;
    anonymousBadge: string;
    namedBadge: string;
    aiSectionLabel: string;
    aiDecisionSafe: string;
    aiDecisionReview: string;
    aiDecisionBlocked: string;
    aiProviderLabel: string;
    aiCategoriesLabel: string;
    aiReasonLabel: string;
    aiNoCategories: string;
    /** EPIC: Yönetim Paneli Yayındaki Kartların Kompakt Görünümü — the approved-card accordion toggle's two label states. */
    showDetailsAction: string;
    hideDetailsAction: string;
    /** EPIC: Published Note Edit + Re-approval — a distinct badge/heading vocabulary for a pending *revision* on an already-published message, reusing `approve`/`reject`/`approving`/`rejecting` above for the actual buttons (same words, different action bound underneath). */
    pendingRevisionsHeading: string;
    emptyPendingRevisions: string;
    revisionBadge: string;
    revisionCurrentLabel: string;
    revisionProposedLabel: string;
    revisionRejectConfirmTitle: string;
    revisionRejectConfirmBody: string;
  };
  /** EPIC 012: User Content Reporting — the public report dialog reachable from an approved message on the board. Reason labels are also reused by `reportsAdmin` below so the same 8-value vocabulary is never translated twice. */
  report: {
    actionLabel: string;
    dialogTitle: string;
    dialogSubtitle: string;
    reasonLegend: string;
    reasonSpam: string;
    reasonHarassment: string;
    reasonHate: string;
    reasonSexualContent: string;
    reasonViolence: string;
    reasonIllegal: string;
    reasonCopyright: string;
    reasonOther: string;
    detailsLabel: string;
    detailsPlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
    close: string;
    successTitle: string;
    successBody: string;
    errorAlreadyReported: string;
    errorNotFound: string;
    errorGeneric: string;
    /** EPIC 018: reportMessage's server-side rate-limit rejection. */
    errorRateLimited: string;
  };
  /** EPIC 012: the admin report queue at /admin/reports. */
  reportsAdmin: {
    title: string;
    subtitle: string;
    emptyQueue: string;
    reportedAtLabel: string;
    reasonLabel: string;
    detailsLabel: string;
    noDetails: string;
    reporterLabel: string;
    reporterAnonymous: string;
    messageStatusLabel: string;
    messageMissing: string;
    /** EPIC 019: report → suspend bridge — the reported message's real author, distinct from reporterLabel above (who filed the report, almost always a different person). Suspend/unsuspend button text and dialog reuse usersAdmin.* directly, not duplicated here. */
    reportedUserLabel: string;
    viewUserAction: string;
    resolveAction: string;
    resolving: string;
    dismissAction: string;
    dismissing: string;
    archiveMessageAction: string;
    archiving: string;
    errorGeneric: string;
    unauthorizedTitle: string;
    unauthorizedBody: string;
  };
  /** EPIC 013: the admin user management surface at /admin/users. Reuses `moderation.status*` for message-count labels rather than translating pending/approved/rejected/archived a second time. */
  usersAdmin: {
    title: string;
    subtitle: string;
    roleUser: string;
    roleAdmin: string;
    statusActive: string;
    statusSuspended: string;
    contentLabel: string;
    suspendAction: string;
    suspending: string;
    unsuspendAction: string;
    unsuspending: string;
    suspendDialogTitle: string;
    suspendDialogBody: string;
    suspendReasonLabel: string;
    suspendReasonPlaceholder: string;
    suspendConfirm: string;
    suspendCancel: string;
    suspendedLabel: string;
    reasonLabel: string;
    noReason: string;
    youLabel: string;
    errorGeneric: string;
    unauthorizedTitle: string;
    unauthorizedBody: string;
  };
  invitationsAdmin: {
    title: string;
    subtitle: string;
    createHeading: string;
    emailLabel: string;
    emailPlaceholder: string;
    maxUsesLabel: string;
    expiryLabel: string;
    expiryNone: string;
    expiry7Days: string;
    expiry30Days: string;
    createButton: string;
    creating: string;
    createError: string;
    listHeading: string;
    linkLabel: string;
    copyButton: string;
    copied: string;
    usageLabel: string;
    statusActive: string;
    statusExpired: string;
    statusUsed: string;
    statusRevoked: string;
    revokeButton: string;
    revoking: string;
    noInvitationsYet: string;
    createdLabel: string;
    expiresLabel: string;
    neverExpires: string;
    recipientLabel: string;
    noRecipient: string;
    emailStatusLabel: string;
    emailStatusSent: string;
    emailStatusFailed: string;
    emailStatusNotConfigured: string;
    emailStatusNotRequested: string;
    emailNotConfiguredNotice: string;
  };
  memory: {
    preserveAction: string;
    pageTitle: string;
    notEligibleTitle: string;
    notEligibleBody: string;
    step1Heading: string;
    step2Heading: string;
    captureNoteOnly: string;
    captureNoteOnlyHint: string;
    captureSurrounding: string;
    captureSurroundingHint: string;
    step3Heading: string;
    outputPersonalPdf: string;
    outputPersonalPdfHint: string;
    outputDigitalFrame: string;
    outputDigitalFrameHint: string;
    outputPhysicalGift: string;
    outputPhysicalGiftHint: string;
    frameLabel: string;
    step4Heading: string;
    previewDisclaimer: string;
    continueButton: string;
    backButton: string;
    createButton: string;
    creating: string;
    createError: string;
    downloadReadyTitle: string;
    downloadReadyBody: string;
    downloadButton: string;
    digitalHeading: string;
    digitalInstructions: string;
    shoppierButton: string;
    shoppierUnavailable: string;
    codeLabel: string;
    codePlaceholder: string;
    redeemButton: string;
    redeeming: string;
    redeemError: string;
    redeemSuccess: string;
    physicalHeading: string;
    /** EPIC 053: shown instead of the order-number panel while the physical-gift flow isn't live yet (DILEKKUTUM_URL unset) — same fail-safe shape as `shoppierUnavailable`. */
    physicalUnavailable: string;
    physicalInstructions: string;
    physicalSteps: [string, string, string, string, string];
    orderNumberLabel: string;
    copyButton: string;
    copied: string;
    dilekkutumButton: string;
    codeErrorNotFound: string;
    codeErrorAlreadyUsed: string;
    codeErrorRevoked: string;
    codeErrorExpired: string;
    accessStatusHeading: string;
    accessNotPurchased: string;
    accessCodeAvailable: string;
    accessGranted: string;
    existingProjectsHeading: string;
    startAnotherButton: string;
    /**
     * i18n audit: display names for each frame template
     * (`features/memories/config/frameTemplates.ts`), keyed by frame id —
     * shown at the frame-selection step and the admin order detail page.
     * Same fallback-safe `Record<string, string>` pattern as
     * `write.templateNames`.
     */
    frameNames: Record<string, string>;
  };
  adminAccessCodes: {
    title: string;
    subtitle: string;
    createHeading: string;
    referenceLabel: string;
    referencePlaceholder: string;
    createButton: string;
    creating: string;
    createError: string;
    createdCodeLabel: string;
    copyButton: string;
    copied: string;
    listHeading: string;
    noCodesYet: string;
    codeLabel: string;
    statusLabel: string;
    statusActive: string;
    statusRedeemed: string;
    statusExpired: string;
    statusRevoked: string;
    projectLabel: string;
    noProject: string;
    createdLabel: string;
    redeemedLabel: string;
    notRedeemed: string;
    revokeButton: string;
    revoking: string;
  };
  adminOrders: {
    title: string;
    subtitle: string;
    noOrdersYet: string;
    updateStatusLabel: string;
    statusPending: string;
    statusAwaitingDilekkutum: string;
    statusMatched: string;
    statusInProduction: string;
    statusPackaged: string;
    statusShipped: string;
    statusCompleted: string;
    statusCancelled: string;
    createdLabel: string;
    outputTypeLabel: string;
    detailTitle: string;
    backToList: string;
    memoryHeading: string;
    customerHeading: string;
    productionHeading: string;
    customerNameLabel: string;
    customerEmailLabel: string;
    captureModeLabel: string;
    viewPdfButton: string;
    downloadPdfButton: string;
    viewDetailButton: string;
  };
  boardPage: {
    title: string;
    loading: string;
    emptyRegion: string;
    loadError: string;
    slogan: string;
    ariaLabel: string;
    /** EPIC 026: a brief, one-time, mobile-only hint (dismissed on first drag, and never shown again after that — see InfiniteBoard's own localStorage flag) since this canvas intentionally never scrolls like a normal page. */
    mobileGestureHint: string;
  };
  boardControls: {
    panUp: string;
    panDown: string;
    panLeft: string;
    panRight: string;
    zoomIn: string;
    zoomOut: string;
    returnToCenter: string;
  };
  /** EPIC 021: /board's keyword/date discovery panel — a filter over the existing {from,to} + new keyword search, never a second board-rendering system. */
  boardDiscovery: {
    searchLabel: string;
    searchPlaceholder: string;
    fromLabel: string;
    toLabel: string;
    applyAction: string;
    clearAction: string;
    activeHint: string;
    noResults: string;
    loading: string;
    error: string;
    dateFilterLabel: string;
    dateToday: string;
    dateThisWeek: string;
    dateThisMonth: string;
    dateThisYear: string;
    dateSpecificDay: string;
    dateSpecificDayInputLabel: string;
    filtersToggleLabel: string;
    filtersPanelLabel: string;
    languageFilterLabel: string;
    languageAllLabel: string;
  };
  like: {
    action: string;
    liked: string;
  };
  share: {
    shareAction: string;
    pageTitle: string;
    pageSubtitle: string;
    scopeLabel: string;
    shareButton: string;
    sharing: string;
    error: string;
    shareText: string;
    memoryShareHeading: string;
    socialHeading: string;
    socialFacebook: string;
    socialInstagram: string;
    socialTiktok: string;
    socialInstagramHint: string;
    socialTiktokHint: string;
    /** EPIC 016: shown persistently under the Facebook/Instagram/TikTok row whenever this device supports native file sharing — sets expectation that pressing any of the three opens the phone's own share menu, not that platform's homepage. */
    socialNativeShareHint: string;
    premiumHeading: string;
    premiumBody: string;
    premiumDownloadButton: string;
    premiumDownloadHint: string;
    /**
     * i18n audit: display names for each share format
     * (`features/sharing/config/shareFormats.ts`), keyed by format id —
     * shown as the Square/Story picker pills. Same fallback-safe
     * `Record<string, string>` pattern as `write.templateNames`.
     */
    formatNames: Record<string, string>;
  };
  profile: {
    pageTitle: string;
    subtitle: string;
    thoughtsLabel: string;
    memoriesLabel: string;
    digitalLabel: string;
    physicalLabel: string;
    wallHeading: string;
    publicWallLabel: string;
    copyLinkButton: string;
    copied: string;
    archiveLinkLabel: string;
    memoriesLinkLabel: string;
    wallEmptyMessage: string;
    totalWrittenLabel: string;
    wallVisibilityLabel: string;
    wallVisibilityOnHint: string;
    wallVisibilityOffHint: string;
    wallDescriptionLabel: string;
    wallDescriptionPlaceholder: string;
    wallDescriptionSave: string;
    wallDescriptionSaved: string;
    shareWallDisabledHint: string;
  };
  archive: {
    pageTitle: string;
    subtitle: string;
    allTime: string;
    thisYear: string;
    lastYear: string;
    monthLabel: string;
    orLabel: string;
    fromLabel: string;
    toLabel: string;
    applyRange: string;
    emptyMessage: string;
    emptyMessageAllTime: string;
    statePending: string;
    statePublished: string;
    stateNotPublished: string;
    viewOnBoardAction: string;
    viewMemoryAction: string;
    addToWallAction: string;
    removeFromWallAction: string;
    /** EPIC: Published Note Edit + Re-approval — a published note's own "Düzenle" flow, kept separate from `moderation`'s admin-facing revision vocabulary above even though they describe the same underlying state, since these are the *author's* words for it. */
    editAction: string;
    editDialogTitle: string;
    editSubmitAction: string;
    editCancelAction: string;
    editSuccessMessage: string;
    editExplanation: string;
    editPendingBadge: string;
    editRejectedNotice: string;
    editErrorEmpty: string;
    editErrorTooLong: string;
    editErrorGeneric: string;
  };
  publicWall: {
    notFoundTitle: string;
    notFoundBody: string;
    disabledTitle: string;
    disabledBody: string;
    emptyMessage: string;
    shareWallButton: string;
  };
  memoryLibrary: {
    pageTitle: string;
    subtitle: string;
    emptyMessage: string;
    digitalNoProduct: string;
    digitalWaiting: string;
    digitalGranted: string;
    physicalNoOrder: string;
    viewProjectAction: string;
  };
  onboarding: {
    reopenLabel: string;
    closeLabel: string;
    skipLabel: string;
    backLabel: string;
    nextLabel: string;
    finishLabel: string;
    stepIndicatorLabel: string;
    step1Heading: string;
    step1Body: string;
    step2Heading: string;
    step2Body: string;
    step2StyleLabel: string;
    step3Heading: string;
    step3Body: string;
    step3SubmittedLabel: string;
    step3BoardLabel: string;
    step4Heading: string;
    step4Body: string;
  };
  states: {
    unexpectedTitle: string;
    unexpectedBody: string;
    retry: string;
    home: string;
    board: string;
    notFoundTitle: string;
    notFoundBody: string;
    loadingTitle: string;
  };
  /** EPIC 023: NotificationBell (header dropdown) + the /notifications full-history page. Per-notification copy is derived from its `type` via `typeMessageApproved`/etc. below, never stored pre-rendered — see schema.ts's notificationTypeEnum comment. */
  notifications: {
    bellLabel: string;
    panelTitle: string;
    /** sr-only trailing word after a numeric unread count, same pattern as common.adminNavPendingCountLabel. */
    unreadCountLabel: string;
    /** sr-only per-item marker so unread/read state isn't conveyed by color alone. */
    unreadBadgeLabel: string;
    markAsRead: string;
    markAllAsRead: string;
    markingAllAsRead: string;
    viewAllLink: string;
    emptyTitle: string;
    emptyBody: string;
    loading: string;
    error: string;
    retry: string;
    typeMessageApproved: string;
    typeMessageRejected: string;
    typeReportResolved: string;
    typeReportDismissed: string;
    pageTitle: string;
    pageSubtitle: string;
    signInRequiredBody: string;
    paginationPrev: string;
    paginationNext: string;
    /** "{page}" and "{total}" tokens replaced manually, same convention as write.characterCount's "{count} / {max}". */
    paginationLabel: string;
  };
  legal: {
    lastReviewed: string;
    reviewNotice: string;
    privacyTitle: string;
    privacyIntro: string;
    privacySections: { title: string; body: string }[];
    termsTitle: string;
    termsIntro: string;
    termsSections: { title: string; body: string }[];
    guidelinesTitle: string;
    guidelinesIntro: string;
    guidelinesSections: { title: string; body: string }[];
  };
}
