import { buildToastXml, xmlEscape } from '../lib/toast.js'

const uri = 'dshnar://click?action=stop&nonce=abc123&session=session-1'

console.log('=== 1. Arabic toast with a Stop button ===')
console.log(buildToastXml({
  title: 'dsh — توقّف الجولة',
  body: 'الوكيل عم يشتغل من زمان',
  location: 'notify-ar · session-1',
  button: { text: 'وقّف', uri },
}))

console.log('\n=== 2. XML escaping (title has & < > and the URI has &) ===')
console.log(buildToastXml({
  title: 'A & B <script>',
  body: 'quote " and apostrophe \'',
  button: { text: 'x', uri: 'a&b<c>' },
}))

console.log('\n=== 3. No button (plain status toast) ===')
console.log(buildToastXml({ title: 'خلص الشغل', body: 'workspace · session' }))

console.log('\n=== 4. With icon ===')
console.log(buildToastXml({
  title: 't',
  body: 'b',
  iconPath: 'C:\\Users\\qusay\\AppData\\Local\\dsh-notify-ar\\icon.png',
  button: { text: 'تابع', uri },
}))

console.log('\n=== 5. Root tag check (rule 1) ===')
const xml = buildToastXml({ title: 't' })
console.log('has scenario=reminder :', xml.includes('scenario="reminder"'))
console.log('has activationType    :', xml.includes('activationType="background"'))
console.log('escaped ampersand     :', xmlEscape('a&b') === 'a&amp;b')
