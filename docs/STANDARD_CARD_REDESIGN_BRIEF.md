MINDOT — STANDARD KARTLAR
MASTER REDESIGN BRIEF
VERSİYON 1.1

AMAÇ
MINDOT'un yeni Standard kartlarını yeniden düzenle.

Ana hedef:
Her kartın kendine özgü görsel karakterini korurken, kart üzerinde
100 karakterlik mesaj + yazar satırı için geniş, temiz ve okunabilir
bir metin alanı oluşturmak.

ÖNEMLİ TASARIM İLKESİ
Kartlar sadeleştirilmeyecek.
Mevcut illüstrasyon, motif, doku, renk karakteri ve kart kimliği korunacak.
Değişiklikler esas olarak motiflerin BOYUTU, KONUMU ve YAYILIMI üzerinden yapılacak.

==================================================
1. GLOBAL TEXT SAFE AREA STANDARDI
==================================================

YÜZDE REFERANSI
Tüm yüzdeler, transparan dış alan hariç kartın görünür kağıt kenarına göredir
(x %0 = kağıdın sol kenarı, x %100 = sağ kenarı; y %0 = üst kenar, y %100 = alt kenar).

500×500 (veya daha büyük) master tuvalinde kartın çevresinde kalan transparan
dış boşluk bu yüzdelere DAHİL DEĞİLDİR. Ölçüm tuvalin kenarından değil,
kağıdın görünür kenarından yapılır.

ZORUNLU TEXT SAFE AREA:
x %10–90 / y %14–86 tercih edilen; x %10–90 / y %15–85 minimum kabul sınırıdır.

TAMPON ALANI:
x %8–92 / y %12–88 dekorasyon için dış tampon bölgedir. Bu alan bir text area
değildir; motiflerin mümkün olduğunca burada bile merkezden uzak tutulması
tercih edilir.

Kart bölümlerindeki "x ≥ %90", "y ≥ %86" gibi kurallar zorunlu text safe area
sınırını ifade eder; tampon alanı bunun üzerine eklenen bir tercihtir, çelişki değildir.

Tüm yeni Standard kartlarda hedef temiz metin alanı:

TERCİH EDİLEN
x %10 – %90
y %14 – %86
= %80 genişlik × %72 yükseklik

ASGARİ
x %10 – %90
y %15 – %85
= %80 genişlik × %70 yükseklik

Bu dikdörtgenin içinde:

- belirgin çizgi olmayacak
- koyu motif olmayacak
- yaprak/bitki olmayacak
- büyük şekil olmayacak
- soru işareti/sembol olmayacak
- belirgin boya lekesi olmayacak
- dekoratif nokta yoğunluğu olmayacak
- metnin okunmasını etkileyen belirgin doku olmayacak

Dekorasyon için güvenli dış bant (tampon):

x %8 – %92
y %12 – %88

Motifler mümkün olduğunca bu bandın DIŞINDA kalmalı.

GLOBAL MESAJ STANDARDI
- Yeni image-backed Standard kartların maksimum mesaj uzunluğu: 100 karakter.
- Tasarım 100 karakter için yeterli alan sağlamalı.
- Yeni kartların içerik alanı kod tarafında sonradan kesinleştirilecek.
- Tasarımcı içerik alanına metin, logo, tarih veya domain gömmeyecek.

==================================================
2. EXPORT STANDARDI
==================================================

MASTER DOSYA

- PNG
- RGBA / alpha channel zorunlu
- Kart dışındaki alan tamamen transparan olmalı.
- Kartın kağıt/zemin alanı opak olmalı; yalnızca kenar yumuşatma (anti-aliasing) kaynaklı kısmi alfa pikselleri kabul edilir.
- Arka plan zemini kartın dışına taşmayacak
- Gömülü gölge kullanılmayacak
- Metadata bulunmayacak
- Minimum 500×500 px
- Daha yüksek çözünürlük olabilir
- Görselin içine metin, logo, tarih, URL veya imza eklenmeyecek

MASTER ile WEB DOSYASI AYRI OLACAK.

Web derivative daha sonra MINDOT tarafında üretilecek.
Hedef:
- yaklaşık 600 px
- ≤ 500 KB
- metadata'sız

DOSYA BOYUTU NOTU
Master dosyanın 500 KB altında olması zorunlu değildir; özellikle sulu boya
dokulu masterlar daha büyük olabilir. Ancak MINDOT tarafından üretilecek
yaklaşık 600 px web derivative ≤ 500 KB olmalıdır ve üretim sırasında gerçek
dosya boyutu ölçülerek doğrulanacaktır.

Tasarımcı SADECE MASTER PNG teslim edecek.

==================================================
3. ARCHIVE
==================================================

KART KARAKTERİ
- Arşiv / eski belge / yaşanmışlık hissi
- Çift çerçeve
- Köşelerde kırık/kesilmiş yapı
- Eskitilmiş kağıt
- Yıldız/nokta/divider karakteri
- Yaşanmışlık ve eski belge dokusu korunacak

TEMEL SORUN
Mevcut dekorasyonlar temiz text area'yı daraltıyor.

HEDEF
Tercih:
x %10–90
y %14–86

Minimum:
x %10–90
y %15–85

ÖNERİLEN DÜZENLEME
- Üst yıldızlı divider yukarı alınmalı.
- Divider'ın alt ucu mümkünse y ≤ %11 içinde kalmalı.
- Minimum kabul: y ≤ %12.
- Sol orta leke text area dışına alınmalı veya çok daha soluklaştırılmalı.
- Sol alt leke/sıçramalar text area dışına çıkarılmalı.
- Alt dekorasyon y ≥ %89 bandında kalmalı.
- Çift çerçeve korunmalı.
- Kağıdın yıpranmış/kesik kenarları korunmalı.
- Yıldız/nokta motifinin karakteri korunmalı.

NOT
Archive için alt dekorasyon kuralı bilinçli olarak daha sıkıdır: hedef y ≥ %89.

TEXT AREA
Tercih:
x %10, y %14, width %80, height %72

Minimum:
x %10, y %15, width %80, height %70

Maksimum mesaj: 100 karakter

==================================================
4. ARTWORK
==================================================

KART KARAKTERİ
- Koyu lacivert dokulu kağıt
- Çift altın çerçeve
- Kırık köşeler
- Altın varak/metallic motifler
- Üst yıldızlı dekorasyon
- Alt noktalı divider
- Sağ alt yaprak dalı

TEMEL SORUNLAR
1. Ortadaki eşkenar dörtgenli divider text area'yı ortadan kesiyor.
2. Üst yıldızlı divider fazla aşağıda.
3. Sağ alt yaprak dalı fazla içeride.
4. Sol alt varak kırıntıları içeri taşıyor.
5. Koyu zemin üzerinde mevcut koyu MINDOT text color okunamıyor.

ÖNEMLİ
Tasarımcı metin rengini değiştirmeyecek.
Koyu lacivert zemin korunacak.

KOD TARAFINDA AYRI İŞ OLARAK
kart başına açık text color desteği daha sonra eklenecek.
Bu nedenle tasarım, temiz metin alanı sağlayacak şekilde hazırlanmalı.

ÖNERİLEN DÜZENLEME
- Orta eşkenar dörtgenli divider kaldırılmalı.
- Tercihen alt divider ile görsel ilişki kurulmalı.
- Üst yıldızlı divider yukarı alınmalı.
- Yıldızın tamamı y ≤ %12 içinde kalmalı.
- Sağ alt yaprak dalı köşeye çekilmeli:
  x ≥ %90 veya y ≥ %86.
- Sol alt varak kırıntıları x ≤ %10 veya y ≥ %86 içinde kalmalı.
- Text area tamamen düz, temiz lacivert doku üzerinde kalmalı.
- Çerçeve korunmalı.

TEXT AREA
Tercih:
x %10, y %14, width %80, height %72

Minimum:
x %10, y %15, width %80, height %70

Maksimum mesaj: 100 karakter

==================================================
5. CREATIVE
==================================================

KART KARAKTERİ
- Eskitilmiş bej kağıt
- Dolunay
- Katmanlı sulu boya dağlar
- Yıldızlar
- Manzara/eskiz hissi

TEMEL SORUN
Dağlar kartın alt yarısını neredeyse tamamen kaplıyor.
Ay da sol üstte çok büyük.

ÖNEMLİ
Dağların üzerine metin koyarak veya metin rengini değiştirerek
sorun çözülmeyecek.
Tek renk metin hem koyu hem açık dağ tonlarında aynı anda okunamıyor.

ÇÖZÜM
Temiz metin alanı oluşturmak için motiflerin konumu değiştirilmelidir.

ÖNERİLEN DÜZENLEME
- Ay yaklaşık %50 küçültülsün.
- Ay sol üst veya sağ üst köşeye alınsın.
- Yaklaşık çap: %18–20.
- Merkez tercihen köşeye yakın olsun.
- Dağlar alçak bir ufuk şeridine dönüştürülsün.
- Koyu dağların tamamı mümkün olduğunca y ≥ %87 bandında olsun.
- Katmanlı dağ yapısı korunmalı.
- Açık arka dağlar da alt banda sıkıştırılmalı.
- Çok hafif arka dağ dokusu kullanılacaksa text area içinde ancak
  çok düşük kontrastlı "hayalet" doku olabilir.
- Yıldızlar safe area dışına alınmalı.
- Alt divider korunmalı; dağ şeridiyle görsel olarak uyumlandırılmalı.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
6. HALF-THOUGHT
==================================================

KART KARAKTERİ
- Pembe yırtık kağıt
- Yarım düşünce / devam hissi
- Eğik çizgi
- Bordo yaprak dalı
- Yarım sulu boya daire
- Küçük ışınlar
- Alt divider

TEMEL SORUN
Kartın ortasından geçen eğik çizgi text area'yı ikiye bölüyor.

ÖNERİLEN DÜZENLEME
- Eğik çizgi merkezden kaldırılmalı.
- Tercih edilen yeni yer: üst bant, y %8–12.
- Yaklaşık x %22–88 aralığında devam edebilir.
- Aynı hafif eğim korunabilir.
- Alternatif: alt banda, y %86–89.
- Çizgi hiçbir şekilde text safe area içine girmemeli.

DİĞER MOTİFLER
- Sol üst ışınlar küçültülmeli.
- Işınlar x ≤ %10 veya y ≤ %12 içinde kalmalı.
- Sağ alt bordo yaprak ve yarım daire köşeye taşınmalı.
- Yapraklar x ≥ %90 veya y ≥ %86 içinde kalmalı.
- Yırtık kenar korunmalı.
- Alt divider korunmalı.
- Kağıdın pembe tonu korunmalı.

OPSİYONEL
Yazar satırı kontrastını artırmak için kağıt tonu çok hafif açılabilir,
ancak pembe kart karakteri kesinlikle kaybolmamalı.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
7. NATURE
==================================================

KART KARAKTERİ
- Kırık beyaz / doğal kağıt
- Eğrelti otu
- Soluk arka yapraklar
- Sulu boya/sıçrama dokusu
- Alt nokta/çizgi dekorasyonu

TEMEL SORUN
Eğrelti otu kartın sol yaklaşık üçte birlik bölümünü kaplıyor.
Mevcut temiz alan genişliği yaklaşık %52.

HEDEF
Metin alanı genişliğinin en az %80 olması.

ÖNERİLEN DÜZENLEME
Eğrelti otu iki seçenekten biriyle düzenlenebilir:

SEÇENEK A
- Eğreltiyi sol kenar boyunca ince bir dekoratif şeride dönüştür.
- Tüm koyu yapraklar x ≤ %7 içinde kalsın.
- Metin bandına en az %3 boşluk bırak.

SEÇENEK B
- Eğreltiyi küçük köşe filizlerine böl.
- Büyük merkezi yaprak kütlesini kaldır.
- Yapraklar üst ve alt köşelere dağıtılabilir.
- Metin alanı tamamen açık bırakılmalı.

SOLUK YAPRAKLAR
- Text area içinden çıkarılmalı.
- Belirgin doku bırakmayacak şekilde köşelere taşınmalı.

ALT DEKORASYON
- Nokta ve çizgi korunabilir.
- Yeri değişmek zorunda değil.
- Text area'nın altında kalmalı.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
8. SPECIAL-DAY
==================================================

KART KARAKTERİ
- Krem kağıt
- Büyük sıcak tonlu güneş
- Yeşil yaprak dalı
- Sarı sulu boya yaprak kümeleri
- Kutlama/özel gün hissi
- Turuncu sıçrama noktaları
- Alt divider

TEMEL SORUN
Güneş + yaprak dalı birlikte kartın sol yaklaşık yarısını kaplıyor.
Kenar yaprakları da sağ taraftan içeri giriyor.

ÖNERİLEN DÜZENLEME

GÜNEŞ
- Yaklaşık %50 küçültülmeli.
- Sol üst köşeye taşınmalı.
- Güneş yaklaşık %20 çapında çeyrek disk hissinde olmalı.
- Merkez, kağıdın sol üst köşesine yakın/üzerinde olmalı; böylece x ≤ %10 veya y ≤ %12 koşulu gerçekten korunmalı.
- Güneşin sıcak turuncu/sarı boya karakteri korunmalı.

YEŞİL DAL
İki seçenek:
A) Sol kenarda en fazla %9 genişliğinde ince şerit
veya
B) Sol alt köşede küçük bir dal/sprig.

B seçeneği tercih edilir.

KENAR YAPRAKLARI
- Sol ve sağ kümeler kenar bantlarına çekilmeli.
- x ≤ %9 veya x ≥ %91.
- Üst kümeler y ≤ %12.
- Alt kümeler y ≥ %87.

SIÇRAMA NOKTALARI
- Text safe area içinden kaldırılmalı.
- Çerçeve/köşe alanlarında kalmalı.

ALT DIVIDER
- Korunacak.
- Mevcut alt bölgede kalabilir.

METİN RENGİ
- Değişmeyecek.
- Krem kağıt üzerinde mevcut koyu metin rengi yeterli.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
9. THOUGHT-QUESTION
==================================================

KART KARAKTERİ
- Krem/yeşil kağıt
- Büyük ? sembolü
- Işınlar
- Sulu boya lekeleri
- Sağ alt yaprak dalı
- Alt çizgi/nokta dekorasyonu

TEMEL SORUNLAR
- ? sembolü fazla büyük ve fazla aşağıda.
- Sağ alt dal çok içeride.
- Sol üst leke/yay text area'ya giriyor.

ÖNERİLEN DÜZENLEME

SORU İŞARETİ
- Yaklaşık %50 küçültülebilir.
- Yukarı alınmalı.
- Tamamı tercihen y ≤ %12 içinde kalmalı.
- Işınlarla birlikte yaklaşık x %35–65 bandında olabilir.
- ? sembolü kartın ana kimliği olduğu için kesinlikle korunmalı.

SAĞ ALT YAPRAK
- Sağ alt köşeye çekilmeli.
- x ≥ %90 veya y ≥ %86.

SOL ÜST LEKE/YAY
- Köşeye küçültülmeli.
- x ≤ %10 veya y ≤ %12.
- Belirgin koyu yay çizgisi safe area'ya girmemeli.

SOL ALT YAY
- x ≤ %10 veya y ≥ %86.

ALT ÇİZGİ + NOKTA
- Korunabilir.
- Mevcut alt bant uygundur.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
10. NAZAR
==================================================

KART KARAKTERİ
- Krem kağıt
- Büyük kobalt nazar gözü
- Altın ip
- Mavi-altın yapraklar
- Sulu boya lekeleri
- Mavi/altın noktalar

TEMEL SORUN
Nazar gözü mevcut haliyle çok büyük.
Göz + dal + sol yaprak sütunu text area'nın sol tarafını dolduruyor.

ÖNERİLEN DÜZENLEME

NAZAR GÖZÜ
- Yaklaşık %50 küçültülmeli.
- Sol üst köşeye alınmalı.
- Çap yaklaşık %18–20.
- Merkez yaklaşık x %5 / y %5.
- Gözün tüm halkaları ve kimliği korunmalı.
- Altın ip korunmalı.

GÖZÜN SAĞINDAKİ DAL
- Üst banda taşınmalı.
- y ≤ %12.
- Gözden sağa doğru ilerleyebilir.

SOL YAPRAK SÜTUNU
- Sol kenar şeridine alınmalı.
- Tamamı x ≤ %9.
- Yapraklar içeri değil dışarı açılmalı.

SAĞ ALT YAPRAKLAR
- x ≥ %90 veya y ≥ %86.

SULU BOYA LEKELERİ
- Sağ üst: x ≥ %90 / y ≤ %12.
- Sol alt: x ≤ %10 / y ≥ %86.

SERPİLMİŞ NOKTALAR
- Text safe area içinden kaldırılmalı.
- Köşe ve çerçeve bölgelerine taşınmalı.

METİN RENGİ
- Değişmeyecek.
- Krem kağıt üzerinde yeterli kontrast var.

TEXT AREA
x %10–90 / y %14–86
80×72

Minimum:
x %10–90 / y %15–85
80×70

Maksimum mesaj: 100 karakter

==================================================
11. GENEL GÖRSEL KALİTE
==================================================

Her kart yeniden düzenlenirken:

- Ana motif tamamen yok edilmeyecek.
- Kart kimliği korunacak.
- Motifler sadece köşeye itilmiş rastgele süsler gibi görünmeyecek.
- Kompozisyon dengeli kalacak.
- Text area görünmez bir "boş merkez" olarak tasarlanacak.
- Dekorasyon text area'yı çevrelemeli, üzerine binmemeli.
- Kartın mevcut renk paleti korunmalı.
- Sulu boya / kağıt / eskitme dokusu korunmalı.
- Yeni tasarımın görsel ağırlığı bir tarafa yığılmamalı.
- Safe area dışındaki motifler yine estetik bir kompozisyon oluşturmalı.

==================================================
12. TESLİM ÖNCESİ KONTROL
==================================================

Her master PNG teslim edilmeden önce kontrol et:

[ ] RGBA
[ ] Transparan dış alan
[ ] Kart alanı opak (yalnızca kenar yumuşatma kaynaklı kısmi alfa kabul)
[ ] Metadata yok
[ ] Minimum 500×500
[ ] Text area x %10–90
[ ] Text area y %14–86 tercihen
[ ] Minimum x %10–90 / y %15–85
[ ] Safe area içinde belirgin motif yok
[ ] 100 karakterlik mesaj için görsel alan yeterli
[ ] Yazar satırı için de boş alan var
[ ] Metin/logo/tarih/domain gömülü değil
[ ] Kartın görsel karakteri korunmuş

==================================================
13. DOSYA ADLARI
==================================================

Dosyalar şu isimlerle teslim edilecek:

archive.png
artwork.png
creative.png
half-thought.png
nature.png
special-day.png
thought-question.png
nazar.png

Her dosya MASTER dosyadır.

Web sürümlerini tasarımcı üretmeyecek.

==================================================
14. SON KURAL
==================================================

Tasarımcı bu brief'teki safe area değerlerini değiştirmemeli.

Yeni bir görsel çözüm teknik olarak daha iyi görünüyorsa bile,
80×72 tercih edilen alanı korumaya çalış.

Öncelik sırası:

1. 100 karakter okunabilirliği
2. Temiz metin alanı
3. Kartın görsel kimliği
4. Dekoratif detayların korunması

Tasarımın amacı:
"Boş bir kart yapmak" değil,
"görsel olarak karakterli ama mesaj için güçlü bir merkez alanı olan kart yapmak."

TESLİM:
Her kart için yalnızca temizlenmiş MASTER PNG.
