import { useStore } from './store.ts';

const en = {
  elements: 'Elements', myParts: 'My parts', search: 'Search elements', noResults: 'Nothing matches. Try another word, or ask the assistant to make it.',
  cutFromPhoto: 'Cut from photo', makePart: 'Make a part', makePartPrompt: 'Make me a part: ', noParts: 'Cut parts out of your own photos or ask the assistant to make one. They stay here for every project.',
  assistant: 'Assistant', memory: 'What Ammarc knows', typeHere: 'Say what to change…', send: 'Send', hold: 'Tap to talk', listening: 'Listening… tap to stop',
  ex1: 'Put a steel inspection door here, hinge on the left', ex2: 'Add safety grating between the platform and the duct', ex3: 'Make it 3D',
  emptyChat: 'Mark a spot or drop an element, then say what you want in one sentence.',
  dropTitle: 'Drop a photo of the spot', dropSub: 'or tap to choose one. You can also paste an image.', choosePhoto: 'Choose photo', blank: 'Start on a blank board',
  select: 'Select', pen: 'Mark', arrow: 'Arrow', dimension: 'Dimension', text: 'Note', eraser: 'Eraser', lasso: 'Cut part',
  flip: 'Flip', hinge: 'Hinge', left: 'left', right: 'right', duplicate: 'Duplicate', delete: 'Delete', sizeCm: 'Size (cm)',
  undo: 'Undo', redo: 'Redo', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', versions: 'Versions', compare: 'Before / after', before: 'Before', after: 'After',
  export: 'Export', exportPng: 'Image (PNG)', exportPngSub: 'With your dimension lines and notes.', download: 'Download', original: 'Original',
  pitch: 'Pitch slide (PowerPoint)', pitchSub: 'Before and after, with hazard, consequence and solution.', draft: 'Draft with Claude', drafting: 'Drafting…',
  title: 'Title', hazard: 'Hazard', consequence: 'Consequence', solution: 'Solution', concept: 'Concept illustration — not to scale', language: 'Language',
  thinking: 'Reading your marks…', rendering: 'Drawing it…', checking: 'Checking the result…', saving: 'Saving…',
  remember: 'Remember this', remembered: 'Saved to what Ammarc knows', fixIt: 'Fix it', demo: 'Demo mode', demoTip: 'No API keys yet: the assistant and renderer are simulated.',
  rules: 'Rules', specs: 'Spec book', glossary: 'His words', addRule: 'Add a rule', add: 'Add', newProject: 'New idea', projects: 'Ideas', rename: 'Rename',
  signIn: 'Sign in', password: 'Password', wrong: 'Wrong password', tapWhere: 'Tap where it goes, then send again.',
  valueDim: 'Size, e.g. 90 cm', valueNote: 'Note', partName: 'Name this part', save: 'Save', cancel: 'Cancel', close: 'Close',
  partSaved: 'Saved to My parts', chat: 'Chat', draw: 'Draw', more: 'More', noVersions: 'Versions appear here after the first change.',
  error: 'Something went wrong', retry: 'Try again', partMade: 'Added to My parts. Drag it onto the board.', menu: 'Menu',
  step1: 'Mark the spot', step2: 'Say it once', step3: 'Pitch it', waitBusy: 'One moment — finishing the current change.',
  seeAll: 'See all', cutSub: 'Draw around equipment in your photo', makeSub: 'Describe it and the assistant makes it',
  hintPen: 'Draw around the spot to change — or tap once on it', hintArrow: 'Drag from the tail to what it points at',
  hintDimension: 'Drag along the length, then type the size', hintText: 'Tap where the note goes', hintEraser: 'Tap or drag over marks to remove them',
  hintLasso: 'Draw around the part to cut it out of the photo',
  stepRead: 'Reading', stepDraw: 'Drawing', stepSave: 'Saving',
  assistantSub: 'English · عربي · voice', ideas: 'Ideas', originalPhoto: 'Original photo', blankBoard: 'Blank board', current: 'Current',
  hidePanel: 'Hide panel', zoomLabel: 'Zoom — click to fit',
};
type Dict = typeof en;

const ar: Dict = {
  elements: 'العناصر', myParts: 'قطعي', search: 'ابحث عن عنصر', noResults: 'ما في نتيجة. جرّب كلمة ثانية أو اطلب من المساعد يسويها.',
  cutFromPhoto: 'قص من الصورة', makePart: 'سوّ قطعة', makePartPrompt: 'سوّ لي قطعة: ', noParts: 'قص قطع من صورك أو اطلب من المساعد يسوي لك وحدة. تبقى هنا لكل المشاريع.',
  assistant: 'المساعد', memory: 'وش يعرف Ammarc', typeHere: 'قول وش تبي تغيّر…', send: 'إرسال', hold: 'اضغط وتكلم', listening: 'أسمعك… اضغط للإيقاف',
  ex1: 'حط باب تفتيش حديد هنا، المفصلة يسار', ex2: 'أضف جريتنج بين المنصة والدكت', ex3: 'خلها 3D',
  emptyChat: 'حدد مكان أو اسحب عنصر، وبعدين قول اللي تبيه بجملة وحدة.',
  dropTitle: 'حط صورة المكان هنا', dropSub: 'أو اضغط واختار صورة. تقدر تلصق صورة بعد.', choosePhoto: 'اختر صورة', blank: 'ابدأ بلوحة فاضية',
  select: 'تحديد', pen: 'تعليم', arrow: 'سهم', dimension: 'مقاس', text: 'ملاحظة', eraser: 'ممحاة', lasso: 'قص قطعة',
  flip: 'اقلب', hinge: 'المفصلة', left: 'يسار', right: 'يمين', duplicate: 'نسخ', delete: 'حذف', sizeCm: 'المقاس (سم)',
  undo: 'تراجع', redo: 'إعادة', zoomIn: 'تكبير', zoomOut: 'تصغير', fit: 'ملائمة', versions: 'النسخ', compare: 'قبل / بعد', before: 'قبل', after: 'بعد',
  export: 'تصدير', exportPng: 'صورة (PNG)', exportPngSub: 'مع خطوط المقاسات والملاحظات.', download: 'تحميل', original: 'الأصلي',
  pitch: 'شريحة عرض (PowerPoint)', pitchSub: 'قبل وبعد، مع الخطر والنتيجة والحل.', draft: 'اكتبها مع Claude', drafting: 'جاري الكتابة…',
  title: 'العنوان', hazard: 'الخطر', consequence: 'النتيجة', solution: 'الحل', concept: 'رسم توضيحي للفكرة — ليس بمقياس', language: 'اللغة',
  thinking: 'أقرأ تعليماتك…', rendering: 'أرسمها…', checking: 'أتأكد من النتيجة…', saving: 'أحفظ…',
  remember: 'تذكّر هذا', remembered: 'انحفظ في اللي يعرفه Ammarc', fixIt: 'صلّحها', demo: 'وضع التجربة', demoTip: 'ما في مفاتيح API للحين: المساعد والرسم محاكاة.',
  rules: 'القواعد', specs: 'دفتر المواصفات', glossary: 'كلماته', addRule: 'أضف قاعدة', add: 'إضافة', newProject: 'فكرة جديدة', projects: 'الأفكار', rename: 'تغيير الاسم',
  signIn: 'دخول', password: 'كلمة المرور', wrong: 'كلمة المرور غلط', tapWhere: 'اضغط على المكان وبعدين أرسل مرة ثانية.',
  valueDim: 'المقاس، مثلاً 90 سم', valueNote: 'ملاحظة', partName: 'سمّ القطعة', save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق',
  partSaved: 'انحفظت في قطعي', chat: 'المحادثة', draw: 'رسم', more: 'المزيد', noVersions: 'النسخ تطلع هنا بعد أول تعديل.',
  error: 'صار خطأ', retry: 'حاول مرة ثانية', partMade: 'انضافت لقطعي. اسحبها على اللوحة.', menu: 'القائمة',
  step1: 'حدد المكان', step2: 'قولها مرة وحدة', step3: 'اعرضها', waitBusy: 'لحظة — أخلص التعديل الحالي.',
  seeAll: 'عرض الكل', cutSub: 'ارسم حول المعدة في صورتك', makeSub: 'وصّفها والمساعد يسويها',
  hintPen: 'ارسم حول المكان اللي تبي تغيّره — أو اضغط عليه مرة', hintArrow: 'اسحب من بداية السهم إلى الشي اللي يأشر عليه',
  hintDimension: 'اسحب على الطول وبعدين اكتب المقاس', hintText: 'اضغط مكان الملاحظة', hintEraser: 'اضغط أو اسحب على التعليمات عشان تمسحها',
  hintLasso: 'ارسم حول القطعة عشان تقصها من الصورة',
  stepRead: 'أقرأ', stepDraw: 'أرسم', stepSave: 'أحفظ',
  assistantSub: 'English · عربي · صوت', ideas: 'الأفكار', originalPhoto: 'الصورة الأصلية', blankBoard: 'لوحة فاضية', current: 'الحالية',
  hidePanel: 'إخفاء اللوحة', zoomLabel: 'التكبير — اضغط للملائمة',
};

const dicts = { en, ar };
export type Key = keyof Dict;
export const useT = () => {
  const lang = useStore((s) => s.lang);
  return (k: Key) => dicts[lang][k];
};
export const tr = (lang: 'en' | 'ar', k: Key) => dicts[lang][k];
