ObjC.import('AppKit');
function run() {
  var app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://example.com'));
  if (!app) throw new Error('No default HTTPS browser');
  return ObjC.unwrap(app.path);
}
