# Maintainer: Your Name <your.email@example.com>
pkgname=hel-store
pkgver=1.0.0 # يجب تحديث هذا الإصدار يدويًا أو سحبه ديناميكيًا إذا كان هناك مصدر موثوق
pkgrel=1
pkgdesc="متجر تطبيقات هلوان"
arch=('x86_64')
url="https://github.com/helwan-linux/helwan-store"
license=('GPL3') # تأكد من أن هذا هو الترخيص الصحيح للمشروع
depends=('electron' 'gtk3' 'libappindicator-gtk3' 'nss' 'alsa-lib' 'libxtst') # تبعيات Electron الأساسية، قد تحتاج للمزيد
makedepends=('npm' 'git') # نحتاج npm للبناء و git للاستنساج

source=("$pkgname::git+$url.git#branch=main") # افترض أن الفرع الرئيسي هو "main"
sha256sums=('SKIP') # استخدم SKIP مؤقتًا لتطوير Git، أو قم بإنشاء sums حقيقية لإصدار ثابت

build() {
  # ندخل إلى الدليل الذي يحتوي على package.json
  cd "$srcdir/$pkgname/hel-store" # هذا هو التعديل
  npm install --prefix . --production
  # إذا كان هناك خطوة بناء محددة لتطبيق Electron (مثل electron-builder)، أضفها هنا
  # على سبيل المثال: npm run build
}

package() {
  # ندخل إلى الدليل الذي يحتوي على ملفات المشروع لبدء التثبيت
  cd "$srcdir/$pkgname/hel-store" # هذا هو التعديل أيضًا

  # تثبيت ملفات التطبيق
  install -d "$pkgdir/opt/$pkgname"
  # انسخ محتويات مجلد المشروع (الذي يحتوي على package.json)
  cp -r ./* "$pkgdir/opt/$pkgname/"

  # تعديل ملفات npm لتعمل بشكل صحيح في الحزمة المثبتة
  rm -rf "$pkgdir/opt/$pkgname/node_modules/.bin"

  # إنشاء رابط رمزي (symlink) للثنائي التنفيذي
  install -d "$pkgdir/usr/bin"
  ln -s "/opt/$pkgname/node_modules/.bin/electron" "$pkgdir/usr/bin/$pkgname"

  # تثبيت ملف .desktop
  install -d "$pkgdir/usr/share/applications"
  # تأكد من أن ملف .desktop موجود في نفس الدليل الحالي (hel-store)
  install -m644 helwan-store.desktop "$pkgdir/usr/share/applications/"

  # تثبيت الأيقونات
  install -d "$pkgdir/usr/share/icons/hicolor/scalable/apps/"
  # تأكد من أن مسار الأيقونة صحيح من الدليل الحالي (hel-store)
  install -m644 assets/icons/app_icon.png "$pkgdir/usr/share/icons/hicolor/scalable/apps/$pkgname.png"
}

