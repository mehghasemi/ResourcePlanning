export function calendarAppointmentLink(event){
 // CalDAV UID can identify an occurrence, not the appointment. Use its URL property.
 try{const u=new URL(event?.href);return u.origin==='https://callisto.baridsoft.ir'&&!u.username&&!u.password&&u.pathname==='/Fonix/Calendar/'&&!u.search&&/^#\/viewevent\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(u.hash)?u.href:null;}catch{return null;}
}
// Keep the vendor-supplied URL intact; do not synthesize an authentication flow.
export const calendarLaunchLink=calendarAppointmentLink;
