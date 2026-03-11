// ============================================
// FILE: data/world-countries-part3.js
// Remaining countries to reach 190 total
// ============================================

const WORLD_COUNTRIES_PART3 = {

// ===== AFRICA (remaining) =====

'Sierra Leone': { weight:1, phonePrefix:'232', phoneLen:8, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Sierra Leonean',weight:100,firstNames:['Mohamed','Fatmata','Ibrahim','Mariama','Abu','Hawa','Alhaji','Isata','Samuel','Aminata'],lastNames:['Kamara','Sesay','Koroma','Bangura','Conteh','Turay','Jalloh','Mansaray'],regions:[{state:'Western Area',cities:['Freetown']},{state:'Southern',cities:['Bo','Kenema']},{state:'Northern',cities:['Makeni']}]}],
  occupations:['Teacher','Farmer','Trader','Mining Worker','Doctor'],companies:['Africell SL','Orange SL'],schools:['University of Sierra Leone'],interests:['Football','Music','Church','Dance','Cooking'],
},

Liberia: { weight:1, phonePrefix:'231', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Liberian',weight:100,firstNames:['George','Ellen','Charles','Mary','James','Martha','Joseph','Ruth','Emmanuel','Grace'],lastNames:['Johnson','Weah','Williams','Sirleaf','Doe','Taylor','Boakai','Tubman'],regions:[{state:'Montserrado',cities:['Monrovia']},{state:'Nimba',cities:['Ganta']},{state:'Bong',cities:['Gbarnga']}]}],
  occupations:['Teacher','Farmer','Trader','NGO Worker','Civil Servant'],companies:['Lonestar Cell','Orange Liberia'],schools:['University of Liberia'],interests:['Football','Music','Church','Rice','Community'],
},

Chad: { weight:1, phonePrefix:'235', phoneLen:8, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Chadian',weight:100,firstNames:['Moussa','Fatimé','Ibrahim','Haoua','Mahamat','Amina','Oumar','Halimé'],lastNames:['Déby','Habré','Kamougué','Oueddei','Goukouni','Maldoum'],regions:[{state:'N\'Djamena',cities:['N\'Djamena']},{state:'Logone Occidental',cities:['Moundou']},{state:'Ouaddaï',cities:['Abéché']}]}],
  occupations:['Farmer','Herder','Teacher','Civil Servant','Trader'],companies:['Tigo Chad','Airtel Chad'],schools:['University of N\'Djamena'],interests:['Football','Music','Religion','Cooking','Community'],
},

'Central African Republic': { weight:1, phonePrefix:'236', phoneLen:8, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Central African',weight:100,firstNames:['Jean','Marie','Pierre','Brigitte','Paul','Yvonne','François','Claudine'],lastNames:['Touadéra','Bozizé','Patassé','Kolingba','Ziguélé'],regions:[{state:'Bangui',cities:['Bangui']},{state:'Ouham',cities:['Bossangoa']}]}],
  occupations:['Farmer','Teacher','Trader','NGO Worker','Civil Servant'],companies:['Orange CAR','Telecel'],schools:['University of Bangui'],interests:['Football','Music','Church','Dance','Community'],
},

'South Sudan': { weight:1, phonePrefix:'211', phoneLen:9, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'South Sudanese',weight:100,firstNames:['John','Mary','Peter','Grace','James','Sarah','David','Rebecca','Samuel','Esther'],lastNames:['Garang','Machar','Kiir','Taban','Deng','Wani','Ladu','Lado'],regions:[{state:'Central Equatoria',cities:['Juba']},{state:'Upper Nile',cities:['Malakal']},{state:'Jonglei',cities:['Bor']}]}],
  occupations:['Farmer','Teacher','NGO Worker','Civil Servant','Herder'],companies:['Zain South Sudan','MTN South Sudan'],schools:['University of Juba'],interests:['Football','Wrestling','Music','Church','Community'],
},

Eritrea: { weight:1, phonePrefix:'291', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Eritrean',weight:100,firstNames:['Berhane','Elsa','Tekle','Freweini','Yohannes','Rahel','Medhanie','Sara','Isaias','Almaz'],lastNames:['Haile','Tesfai','Berhe','Gebre','Weldemichael','Tekle','Hagos','Kidane'],regions:[{state:'Maekel',cities:['Asmara']},{state:'Northern Red Sea',cities:['Massawa']},{state:'Southern',cities:['Mendefera']}]}],
  occupations:['Teacher','Farmer','Soldier','Civil Servant','Doctor'],companies:['EriTel'],schools:['University of Asmara'],interests:['Cycling','Football','Coffee','Music','Church','History'],
},

Djibouti: { weight:1, phonePrefix:'253', phoneLen:8, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Djiboutian',weight:100,firstNames:['Mohamed','Fatima','Ahmed','Hodan','Omar','Amina','Hassan','Hawa'],lastNames:['Guelleh','Gouled','Aden','Farah','Ali','Youssouf'],regions:[{state:'Djibouti',cities:['Djibouti City','Ali Sabieh']}]}],
  occupations:['Port Worker','Teacher','Soldier','Trader','Civil Servant'],companies:['Djibouti Telecom'],schools:['University of Djibouti'],interests:['Football','Music','Port Life','Tea','Religion'],
},

Gabon: { weight:1, phonePrefix:'241', phoneLen:8, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Gabonese',weight:100,firstNames:['Jean','Marie','Pierre','Paulette','Ali','Brigitte','Omar','Yvonne'],lastNames:['Bongo','Mba','Obame','Nze','Nguema','Oyono'],regions:[{state:'Estuaire',cities:['Libreville']},{state:'Haut-Ogooué',cities:['Franceville']},{state:'Ogooué-Maritime',cities:['Port-Gentil']}]}],
  occupations:['Oil Worker','Teacher','Civil Servant','Business Owner','Doctor'],companies:['Airtel Gabon','Total Gabon'],schools:['Omar Bongo University'],interests:['Football','Music','Dance','Nature','Oil Industry'],
},

'Congo Republic': { weight:1, phonePrefix:'242', phoneLen:9, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Congolese',weight:100,firstNames:['Denis','Marie','Jean','Claudine','Pierre','Brigitte','Paul','Yvette'],lastNames:['Sassou','Lissouba','Kolelas','Yhombi','Milongo'],regions:[{state:'Brazzaville',cities:['Brazzaville']},{state:'Pointe-Noire',cities:['Pointe-Noire']}]}],
  occupations:['Oil Worker','Teacher','Farmer','Civil Servant','Trader'],companies:['MTN Congo','Airtel Congo'],schools:['Marien Ngouabi University'],interests:['Football','Rumba','Music','Dance','Church'],
},

Lesotho: { weight:1, phonePrefix:'266', phoneLen:8, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Mosotho',weight:100,firstNames:['Thabo','Lineo','Motlatsi','Palesa','Thabang','Refiloe','Lehlohonolo','Mamello'],lastNames:['Mokhehle','Thabane','Mosisili','Letsie','Majara'],regions:[{state:'Maseru',cities:['Maseru']},{state:'Leribe',cities:['Hlotse']}]}],
  occupations:['Teacher','Farmer','Textile Worker','Mining Worker','Civil Servant'],companies:['Vodacom Lesotho','Econet Lesotho'],schools:['National University of Lesotho'],interests:['Football','Horses','Blanket Culture','Music','Church'],
},

Eswatini: { weight:1, phonePrefix:'268', phoneLen:8, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Swazi',weight:100,firstNames:['Mswati','Sibonelo','Thandi','Siphesihle','Nothando','Lungelo','Nonhlanhla','Bongani'],lastNames:['Dlamini','Nkambule','Mkhonta','Simelane','Maseko','Tfwala'],regions:[{state:'Hhohho',cities:['Mbabane']},{state:'Manzini',cities:['Manzini']}]}],
  occupations:['Teacher','Farmer','Textile Worker','Civil Servant','Nurse'],companies:['MTN Eswatini','Eswatini Mobile'],schools:['University of Eswatini'],interests:['Football','Reed Dance','Music','Church','Nature'],
},

Gambia: { weight:1, phonePrefix:'220', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Gambian',weight:100,firstNames:['Lamin','Fatou','Ousman','Isatou','Ebrima','Mariama','Modou','Binta'],lastNames:['Jallow','Ceesay','Bojang','Touray','Njie','Jammeh','Barrow'],regions:[{state:'Greater Banjul',cities:['Banjul','Serrekunda']},{state:'West Coast',cities:['Brikama']}]}],
  occupations:['Teacher','Farmer','Fisherman','Trader','Tourism Worker'],companies:['Africell Gambia','QCell'],schools:['University of The Gambia'],interests:['Football','Music','Beach','Wrestling','Religion'],
},

'Guinea-Bissau': { weight:1, phonePrefix:'245', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Bissau-Guinean',weight:100,firstNames:['Amilcar','Fatumata','Nuno','Mariama','Domingos','Cadijatu'],lastNames:['Cabral','Vieira','Sanha','Pereira','Gomes'],regions:[{state:'Bissau',cities:['Bissau']},{state:'Gabu',cities:['Gabu']}]}],
  occupations:['Farmer','Fisherman','Trader','Teacher','Civil Servant'],companies:['MTN Guinea-Bissau','Orange'],schools:['Amilcar Cabral University'],interests:['Football','Cashew Nuts','Music','Gumbe','Dance'],
},

'Cape Verde': { weight:1, phonePrefix:'238', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Cape Verdean',weight:100,firstNames:['José','Maria','Carlos','Ana','António','Fernanda','Manuel','Teresa'],lastNames:['Silva','Santos','Lopes','Tavares','Monteiro','Fernandes','Fonseca'],regions:[{state:'Santiago',cities:['Praia']},{state:'São Vicente',cities:['Mindelo']}]}],
  occupations:['Teacher','Fisherman','Tourism Worker','Musician','Civil Servant'],companies:['CVTelecom','Unitel T+'],schools:['University of Cape Verde'],interests:['Morna Music','Beach','Football','Carnival','Morabeza'],
},

'Equatorial Guinea': { weight:1, phonePrefix:'240', phoneLen:9, emailDomains:['gmail.com','yahoo.es'],
  ethnicGroups:[{name:'Equatoguinean',weight:100,firstNames:['Teodoro','María','Francisco','Ana','Pedro','Carmen'],lastNames:['Obiang','Nguema','Mbasogo','Ela','Mba'],regions:[{state:'Litoral',cities:['Bata']},{state:'Bioko Norte',cities:['Malabo']}]}],
  occupations:['Oil Worker','Teacher','Civil Servant','Farmer','Business Owner'],companies:['GEPetrol','SEGESA'],schools:['National University of Equatorial Guinea'],interests:['Football','Music','Oil Industry','Dance'],
},

Mauritania: { weight:1, phonePrefix:'222', phoneLen:8, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Mauritanian',weight:100,firstNames:['Mohamed','Fatimetou','Ahmed','Mariam','Sidi','Aminata','Oumar','Khadijetou'],lastNames:['Ould','Mint','Abdallahi','Ghazouani','Aziz','Taya'],regions:[{state:'Nouakchott',cities:['Nouakchott']},{state:'Dakhlet Nouadhibou',cities:['Nouadhibou']}]}],
  occupations:['Herder','Fisherman','Teacher','Trader','Mining Worker'],companies:['Mauritel','Mattel'],schools:['University of Nouakchott'],interests:['Football','Tea','Camel Racing','Music','Desert'],
},

// ===== EUROPE (remaining) =====

Lithuania: { weight:1, phonePrefix:'370', phoneLen:8, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Lithuanian',weight:100,firstNames:['Lukas','Gabija','Matas','Emilija','Jonas','Austėja','Kajus','Kornelija'],lastNames:['Kazlauskas','Jankauskas','Petrauskas','Stankevičius','Vasiliauskas','Žukauskas'],regions:[{state:'Vilnius',cities:['Vilnius']},{state:'Kaunas',cities:['Kaunas']},{state:'Klaipėda',cities:['Klaipėda']}]}],
  occupations:['Developer','Engineer','Teacher','Doctor','Business Owner'],companies:['Vinted','Nord Security','Telia Lithuania'],schools:['Vilnius University','VU','KTU'],interests:['Basketball','Nature','Beer','Music','Church','History','Tech'],
},

Latvia: { weight:1, phonePrefix:'371', phoneLen:8, emailDomains:['gmail.com','outlook.com','inbox.lv'],
  ethnicGroups:[{name:'Latvian',weight:100,firstNames:['Artūrs','Anna','Dāvis','Emīlija','Roberts','Marta','Kristaps','Alise'],lastNames:['Bērziņš','Kalniņš','Ozols','Jansons','Liepiņš','Krūmiņš'],regions:[{state:'Riga',cities:['Riga']},{state:'Daugavpils',cities:['Daugavpils']},{state:'Liepāja',cities:['Liepāja']}]}],
  occupations:['Developer','Engineer','Teacher','Doctor','Logistics'],companies:['Latvijas Mobilais','LMT','Printful'],schools:['University of Latvia','RTU'],interests:['Hockey','Basketball','Nature','Singing','Midsummer','Church'],
},

Estonia: { weight:1, phonePrefix:'372', phoneLen:8, emailDomains:['gmail.com','outlook.com','hot.ee'],
  ethnicGroups:[{name:'Estonian',weight:100,firstNames:['Rasmus','Sofia','Oliver','Maria','Robin','Hanna','Markus','Emma'],lastNames:['Tamm','Sepp','Mägi','Kask','Kukk','Saar','Rebane','Ilves'],regions:[{state:'Harju',cities:['Tallinn']},{state:'Tartu',cities:['Tartu']},{state:'Pärnu',cities:['Pärnu']}]}],
  occupations:['Developer','Engineer','Startup Founder','Teacher','Designer'],companies:['Wise','Bolt','Playtech','Pipedrive','Skype Estonia'],schools:['University of Tartu','TalTech'],interests:['Tech','E-governance','Sauna','Singing','Nature','Music','Church'],
},

Slovakia: { weight:1, phonePrefix:'421', phoneLen:9, emailDomains:['gmail.com','outlook.com','azet.sk'],
  ethnicGroups:[{name:'Slovak',weight:100,firstNames:['Jakub','Sofia','Adam','Emma','Matej','Laura','Filip','Natália'],lastNames:['Horváth','Kováč','Varga','Tóth','Nagy','Baláž','Molnár','Szabó'],regions:[{state:'Bratislava',cities:['Bratislava']},{state:'Košice',cities:['Košice']},{state:'Žilina',cities:['Žilina']}]}],
  occupations:['Developer','Engineer','Teacher','Doctor','Business Owner'],companies:['ESET','Slovenská sporiteľňa','Kia Slovakia'],schools:['Comenius University','Slovak University of Technology'],interests:['Football','Hockey','Hiking','Beer','Skiing','Music','Church','Bryndzové halušky'],
},

Slovenia: { weight:1, phonePrefix:'386', phoneLen:8, emailDomains:['gmail.com','outlook.com','siol.net'],
  ethnicGroups:[{name:'Slovenian',weight:100,firstNames:['Luka','Eva','Nik','Zala','Jan','Ema','Žan','Lana'],lastNames:['Novak','Horvat','Krajnc','Kovačič','Zupančič','Potočnik'],regions:[{state:'Ljubljana',cities:['Ljubljana']},{state:'Maribor',cities:['Maribor']},{state:'Celje',cities:['Celje']}]}],
  occupations:['Engineer','Developer','Teacher','Doctor','Tourism'],companies:['Gorenje','Krka','Petrol'],schools:['University of Ljubljana','University of Maribor'],interests:['Skiing','Cycling','Nature','Lake Bled','Wine','Football','Church','Hiking'],
},

'Bosnia and Herzegovina': { weight:1, phonePrefix:'387', phoneLen:8, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Bosnian',weight:100,firstNames:['Edin','Amina','Mirza','Emina','Adnan','Lejla','Haris','Aida'],lastNames:['Hodžić','Kovačević','Begović','Hasanović','Đedović','Halilović','Mehmedović'],regions:[{state:'Sarajevo Canton',cities:['Sarajevo']},{state:'Tuzla Canton',cities:['Tuzla']},{state:'Herzegovina-Neretva',cities:['Mostar']}]}],
  occupations:['Engineer','Teacher','Developer','Doctor','Business Owner'],companies:['BH Telecom','m:tel'],schools:['University of Sarajevo'],interests:['Football','Coffee','Ćevapi','Music','Bridge at Mostar','Church','Nature'],
},

'North Macedonia': { weight:1, phonePrefix:'389', phoneLen:8, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Macedonian',weight:100,firstNames:['Aleksandar','Ana','Stefan','Marija','Nikola','Elena','David','Teodora'],lastNames:['Petrov','Stojanovski','Dimitrov','Nikolov','Trajkovski','Georgiev'],regions:[{state:'Skopje',cities:['Skopje']},{state:'Bitola',cities:['Bitola']},{state:'Ohrid',cities:['Ohrid']}]}],
  occupations:['Engineer','Teacher','Developer','Doctor','Business Owner'],companies:['Makedonski Telekom','A1 Macedonia'],schools:['Ss. Cyril and Methodius University'],interests:['Football','Lake Ohrid','Food','Music','History','Church'],
},

Albania: { weight:1, phonePrefix:'355', phoneLen:9, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Albanian',weight:100,firstNames:['Arben','Elona','Erion','Anisa','Dritan','Besa','Klejdi','Arlinda'],lastNames:['Hoxha','Shehu','Berisha','Rama','Basha','Leka','Duka','Topalli'],regions:[{state:'Tirana',cities:['Tirana']},{state:'Durrës',cities:['Durrës']},{state:'Vlorë',cities:['Vlorë','Sarandë']}]}],
  occupations:['Teacher','Developer','Engineer','Business Owner','Tourism','Doctor'],companies:['Vodafone Albania','ALBtelecom','ONE Telecommunications'],schools:['University of Tirana'],interests:['Football','Beach','Food','Byrek','Music','Church','History','Skanderbeg'],
},

Moldova: { weight:1, phonePrefix:'373', phoneLen:8, emailDomains:['gmail.com','mail.ru','outlook.com'],
  ethnicGroups:[{name:'Moldovan',weight:100,firstNames:['Alexandru','Maria','Ion','Elena','Andrei','Ana','Vasile','Cristina'],lastNames:['Popescu','Rusu','Cojocaru','Munteanu','Ceban','Dodon','Sandu'],regions:[{state:'Chișinău',cities:['Chișinău']},{state:'Bălți',cities:['Bălți']}]}],
  occupations:['Teacher','Farmer','Developer','Doctor','IT Professional'],companies:['Orange Moldova','Moldtelecom'],schools:['Moldova State University','Technical University'],interests:['Wine','Football','Music','Dance','Church','Nature','Hora'],
},

Kosovo: { weight:1, phonePrefix:'383', phoneLen:8, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Kosovar',weight:100,firstNames:['Arben','Drita','Burim','Shpresa','Liridon','Vlora','Endrit','Mimoza'],lastNames:['Hoxha','Berisha','Krasniqi','Gashi','Osmani','Haliti','Morina'],regions:[{state:'Pristina',cities:['Pristina']},{state:'Prizren',cities:['Prizren']},{state:'Peja',cities:['Peja']}]}],
  occupations:['Developer','Teacher','Business Owner','Engineer','Doctor'],companies:['IPKO','Vala'],schools:['University of Pristina'],interests:['Football','Music','Coffee','Newborn Monument','Church','History'],
},

Montenegro: { weight:1, phonePrefix:'382', phoneLen:8, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Montenegrin',weight:100,firstNames:['Luka','Ana','Stefan','Milica','Nikola','Jovana','Marko','Sara'],lastNames:['Đukanović','Vuković','Milović','Popović','Jovanović','Petrović'],regions:[{state:'Podgorica',cities:['Podgorica']},{state:'Budva',cities:['Budva']},{state:'Kotor',cities:['Kotor']}]}],
  occupations:['Tourism Worker','Teacher','Engineer','Doctor','Business Owner'],companies:['Crnogorski Telekom','m:tel Montenegro'],schools:['University of Montenegro'],interests:['Basketball','Beach','Bay of Kotor','Music','Football','Church'],
},

Belarus: { weight:1, phonePrefix:'375', phoneLen:9, emailDomains:['gmail.com','mail.ru','tut.by','outlook.com'],
  ethnicGroups:[{name:'Belarusian',weight:100,firstNames:['Nikita','Anastasia','Maxim','Ekaterina','Artem','Polina','Daniil','Darya'],lastNames:['Ivanov','Kuznetsov','Popov','Smirnov','Novikov','Kozlov','Morozov'],regions:[{state:'Minsk',cities:['Minsk']},{state:'Gomel',cities:['Gomel']},{state:'Brest',cities:['Brest']}]}],
  occupations:['Developer','Engineer','Teacher','Doctor','IT Professional'],companies:['Wargaming','EPAM Belarus','MTS Belarus','A1 Belarus'],schools:['Belarusian State University','BSUIR'],interests:['Hockey','Football','Tech','Nature','Potatoes','Music','Church'],
},

// ===== AMERICAS (remaining) =====

Haiti: { weight:1, phonePrefix:'509', phoneLen:8, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Haitian',weight:100,firstNames:['Jean','Marie','Pierre','Rose','Paul','Manoucheka','Jacques','Claudette','Wisly','Guerda'],lastNames:['Jean-Baptiste','Joseph','Pierre','Louis','Charles','Antoine','Saint-Louis','Desir'],regions:[{state:'Ouest',cities:['Port-au-Prince','Pétion-Ville','Delmas']},{state:'Nord',cities:['Cap-Haïtien']},{state:'Artibonite',cities:['Gonaïves']}]}],
  occupations:['Teacher','Farmer','Trader','Nurse','Pastor','NGO Worker'],companies:['Digicel Haiti','Natcom'],schools:['Université d\'État d\'Haïti'],interests:['Football','Kompa Music','Vodou Culture','Church','Cooking','Art','Carnival'],
},

Nicaragua: { weight:1, phonePrefix:'505', phoneLen:8, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Nicaraguan',weight:100,firstNames:['José','María','Carlos','Ana','Luis','Rosa','Daniel','Martha'],lastNames:['García','López','Hernández','Martínez','González','Rodríguez','Ortega'],regions:[{state:'Managua',cities:['Managua']},{state:'León',cities:['León']},{state:'Granada',cities:['Granada']}]}],
  occupations:['Farmer','Teacher','Business Owner','Doctor','Civil Servant'],companies:['Claro Nicaragua','Movistar Nicaragua'],schools:['UNAN-Managua'],interests:['Baseball','Football','Volcanos','Church','Food','Music','Dance'],
},

Belize: { weight:1, phonePrefix:'501', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Belizean',weight:100,firstNames:['John','Maria','Carlos','Ana','David','Rosa','Michael','Grace'],lastNames:['Hernandez','Garcia','Martinez','Smith','Young','Wade','Cadle'],regions:[{state:'Belize',cities:['Belize City']},{state:'Cayo',cities:['San Ignacio']},{state:'Orange Walk',cities:['Orange Walk Town']}]}],
  occupations:['Tourism Worker','Teacher','Farmer','Fisher','Civil Servant'],companies:['BTL','Smart Belize'],schools:['University of Belize'],interests:['Football','Diving','Reggae','Church','Barrier Reef','Mayan Ruins'],
},

Guyana: { weight:1, phonePrefix:'592', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Guyanese',weight:100,firstNames:['Ravi','Shanti','Michael','Grace','David','Priya','Mark','Kamla'],lastNames:['Singh','Persaud','Ramotar','Jagdeo','Ali','Granger','Ramjattan'],regions:[{state:'Demerara-Mahaica',cities:['Georgetown']},{state:'East Berbice',cities:['New Amsterdam']}]}],
  occupations:['Farmer','Teacher','Oil Worker','Mining Worker','Business Owner'],companies:['GTT','Digicel Guyana'],schools:['University of Guyana'],interests:['Cricket','Football','Curry','Music','Church','Carnival','Nature'],
},

Suriname: { weight:1, phonePrefix:'597', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Surinamese',weight:100,firstNames:['Ryan','Priya','Ricardo','Shanti','Desi','Kamini','Henk','Farida'],lastNames:['Bouterse','Santokhi','Venetiaan','Shankar','Wijdenbosch'],regions:[{state:'Paramaribo',cities:['Paramaribo']},{state:'Wanica',cities:['Lelydorp']}]}],
  occupations:['Farmer','Teacher','Mining Worker','Government Employee','Business Owner'],companies:['Telesur','Digicel Suriname'],schools:['Anton de Kom University'],interests:['Football','Music','Roti','Church','Nature','Carnival'],
},

// ===== ASIA (remaining) =====

Afghanistan: { weight:2, phonePrefix:'93', phoneLen:9, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Afghan',weight:100,firstNames:['Ahmad','Fatima','Mohammad','Zainab','Ali','Mariam','Hassan','Sara','Omar','Freshta'],lastNames:['Ahmadzai','Karimi','Mohammadi','Rahmani','Popal','Noorzai','Barakzai','Ghani','Akhundzada'],regions:[{state:'Kabul',cities:['Kabul']},{state:'Herat',cities:['Herat']},{state:'Balkh',cities:['Mazar-i-Sharif']},{state:'Kandahar',cities:['Kandahar']},{state:'Nangarhar',cities:['Jalalabad']}]}],
  occupations:['Teacher','Farmer','Trader','Doctor','Engineer','Carpet Weaver'],companies:['Roshan','Etisalat Afghanistan','MTN Afghanistan'],schools:['Kabul University','Herat University'],interests:['Cricket','Football','Poetry','Buzkashi','Tea','Music','Religion','Kite Flying'],
},

Turkmenistan: { weight:1, phonePrefix:'993', phoneLen:8, emailDomains:['gmail.com','mail.ru'],
  ethnicGroups:[{name:'Turkmen',weight:100,firstNames:['Serdar','Ogulgerek','Merdan','Ayna','Myrat','Jennet','Dovlet','Maral'],lastNames:['Berdimuhamedow','Niyazov','Atayev','Meredov','Rejepov'],regions:[{state:'Ashgabat',cities:['Ashgabat']},{state:'Dashoguz',cities:['Dashoguz']},{state:'Turkmenabat',cities:['Turkmenabat']}]}],
  occupations:['Teacher','Engineer','Gas Worker','Farmer','Civil Servant'],companies:['Altyn Asyr','TGPC'],schools:['Turkmen State University'],interests:['Horse Racing','Akhal-Teke Horses','Carpet Weaving','Football','Music'],
},

Tajikistan: { weight:1, phonePrefix:'992', phoneLen:9, emailDomains:['gmail.com','mail.ru'],
  ethnicGroups:[{name:'Tajik',weight:100,firstNames:['Firdavs','Madina','Rustam','Nilufar','Jamshed','Shoira','Parviz','Gulnora'],lastNames:['Rahmon','Mirzoev','Karimov','Saidov','Nazarov','Sharipov'],regions:[{state:'Dushanbe',cities:['Dushanbe']},{state:'Khujand',cities:['Khujand']},{state:'Kulob',cities:['Kulob']}]}],
  occupations:['Teacher','Farmer','Migrant Worker','Doctor','Engineer'],companies:['Tcell','MegaFon Tajikistan','Babilon-M'],schools:['Tajik National University'],interests:['Football','Buzkashi','Poetry','Music','Tea','Plov','Mountains'],
},

Kyrgyzstan: { weight:1, phonePrefix:'996', phoneLen:9, emailDomains:['gmail.com','mail.ru'],
  ethnicGroups:[{name:'Kyrgyz',weight:100,firstNames:['Adilet','Aidana','Bakyt','Nuriza','Dastan','Aigerim','Ermek','Cholpon'],lastNames:['Atambayev','Jeenbekov','Japarov','Otunbaev','Bakiev'],regions:[{state:'Bishkek',cities:['Bishkek']},{state:'Osh',cities:['Osh']},{state:'Jalal-Abad',cities:['Jalal-Abad']}]}],
  occupations:['Teacher','Farmer','Herder','Business Owner','IT Professional'],companies:['Megacom','Beeline Kyrgyzstan','O!'],schools:['Kyrgyz National University','AUCA'],interests:['Horse Riding','Football','Mountains','Yurt Culture','Kumys','Music','Wrestling'],
},

'East Timor': { weight:1, phonePrefix:'670', phoneLen:8, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Timorese',weight:100,firstNames:['José','Maria','Francisco','Ana','Manuel','Teresa','João','Rosa'],lastNames:['Gusmão','Ramos-Horta','Alkatiri','Araújo','Soares','Da Costa'],regions:[{state:'Dili',cities:['Dili']},{state:'Baucau',cities:['Baucau']}]}],
  occupations:['Farmer','Teacher','Civil Servant','Fisherman','NGO Worker'],companies:['Timor Telecom','Telemor'],schools:['National University of Timor-Leste'],interests:['Football','Church','Traditional Dance','Tais Weaving','Coffee'],
},

// ===== PACIFIC (remaining) =====

Samoa: { weight:1, phonePrefix:'685', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Samoan',weight:100,firstNames:['Tui','Sina','Manu','Leilani','Sione','Moana','Tuilaepa','Alofa'],lastNames:['Tuia','Malielegaoi','Tuilaepa','Afamasaga','Leota','Muagututi\'a'],regions:[{state:'Tuamasaga',cities:['Apia']}]}],
  occupations:['Farmer','Teacher','Church Minister','Fisherman','Civil Servant'],companies:['Digicel Samoa','Bluesky Samoa'],schools:['National University of Samoa'],interests:['Rugby','Church','Fa\'a Samoa','Music','Siva Dance','Cricket'],
},

Tonga: { weight:1, phonePrefix:'676', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Tongan',weight:100,firstNames:['Sione','Mele','Tevita','Ana','Viliami','Salote','Taniela','Lose'],lastNames:['Tupou','Taufa\'ahau','Vaha\'i','Nuku','Moala','Fifita'],regions:[{state:'Tongatapu',cities:['Nuku\'alofa']}]}],
  occupations:['Farmer','Fisherman','Teacher','Church Minister','Civil Servant'],companies:['Digicel Tonga','Tonga Communications'],schools:['University of the South Pacific Tonga'],interests:['Rugby','Church','Kava','Music','Traditional Dance','Whale Watching'],
},

'Solomon Islands': { weight:1, phonePrefix:'677', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Solomon Islander',weight:100,firstNames:['John','Mary','Peter','Grace','James','Ruth','David','Sarah'],lastNames:['Sogavare','Lilo','Kenilorea','Mamaloni','Sikua'],regions:[{state:'Guadalcanal',cities:['Honiara']}]}],
  occupations:['Farmer','Fisherman','Teacher','Logger','Civil Servant'],companies:['Our Telekom','bmobile'],schools:['Solomon Islands National University'],interests:['Football','Rugby','Church','Fishing','Custom Culture','Music'],
},

Vanuatu: { weight:1, phonePrefix:'678', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Ni-Vanuatu',weight:100,firstNames:['John','Mary','Jimmy','Sarah','Joe','Grace','Tom','Ruth'],lastNames:['Lini','Kalsakau','Vohor','Natapei','Salwai'],regions:[{state:'Shefa',cities:['Port Vila']},{state:'Sanma',cities:['Luganville']}]}],
  occupations:['Farmer','Fisherman','Teacher','Tourism Worker','Civil Servant'],companies:['Digicel Vanuatu','TVL'],schools:['University of the South Pacific Vanuatu'],interests:['Kava','Land Diving','Church','Football','Custom Dancing','Naghol'],
},

// ===== CARIBBEAN (remaining) =====

Grenada: { weight:1, phonePrefix:'1473', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Grenadian',weight:100,firstNames:['Jason','Keisha','Andre','Tiffany','Marcus','Shanice'],lastNames:['Mitchell','Charles','Baptiste','Thomas','Joseph'],regions:[{state:'St. George',cities:['St. George\'s']}]}],
  occupations:['Tourism Worker','Farmer','Teacher','Spice Worker','Fisherman'],companies:['Digicel','Flow Grenada'],schools:['St. George\'s University'],interests:['Cricket','Spice','Carnival','Music','Church','Beach','Nutmeg'],
},

'Saint Lucia': { weight:1, phonePrefix:'1758', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Saint Lucian',weight:100,firstNames:['Darren','Keisha','Marcus','Shanice','Jason','Tanya'],lastNames:['Charles','Joseph','St. Rose','Jean','Pierre','Alexander'],regions:[{state:'Castries',cities:['Castries']},{state:'Gros Islet',cities:['Gros Islet']}]}],
  occupations:['Tourism Worker','Teacher','Farmer','Fisherman','Nurse'],companies:['Digicel','Flow Saint Lucia'],schools:['Sir Arthur Lewis Community College'],interests:['Cricket','Jazz Festival','Pitons','Beach','Church','Music','Creole Food'],
},

'Antigua and Barbuda': { weight:1, phonePrefix:'1268', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Antiguan',weight:100,firstNames:['Viv','Keisha','Andre','Tanya','Jason','Shanice'],lastNames:['Richards','Spencer','Bird','James','Joseph'],regions:[{state:'St. John',cities:['St. John\'s']}]}],
  occupations:['Tourism Worker','Teacher','Banker','Civil Servant'],companies:['Digicel','Flow'],schools:['University of the West Indies Five Islands'],interests:['Cricket','Carnival','Beach','Music','Church','Sailing'],
},

Dominica: { weight:1, phonePrefix:'1767', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Dominican (Dominica)',weight:100,firstNames:['Jean','Marie','Pierre','Rose','Patrick','Claudette'],lastNames:['Charles','Skerrit','Douglas','James','John'],regions:[{state:'St. George',cities:['Roseau']},{state:'St. Andrew',cities:['Marigot']}]}],
  occupations:['Farmer','Teacher','Tourism Worker','Fisherman','Civil Servant'],companies:['Digicel','Flow Dominica'],schools:['Dominica State College'],interests:['Nature','Hiking','Boiling Lake','Music','Church','Creole Culture','Hot Springs'],
},

'Saint Kitts and Nevis': { weight:1, phonePrefix:'1869', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Kittitian',weight:100,firstNames:['Denzil','Keisha','Jason','Tanya','Andre','Shanice'],lastNames:['Douglas','Harris','Drew','Simmonds','Richards'],regions:[{state:'Saint George Basseterre',cities:['Basseterre']},{state:'Saint James Windward',cities:['Charlestown']}]}],
  occupations:['Tourism Worker','Teacher','CBI Professional','Civil Servant'],companies:['Digicel','Flow SKN'],schools:['Clarence Fitzroy Bryant College'],interests:['Cricket','Carnival','Music','Beach','Church','Sugar Heritage'],
},

'Saint Vincent': { weight:1, phonePrefix:'1784', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Vincentian',weight:100,firstNames:['Jason','Keisha','Andre','Tanya','Marcus','Grace'],lastNames:['Gonsalves','Mitchell','Eustace','Friday','Alexander'],regions:[{state:'Saint George',cities:['Kingstown']},{state:'Grenadines',cities:['Bequia','Mustique']}]}],
  occupations:['Farmer','Fisherman','Teacher','Tourism Worker','Civil Servant'],companies:['Digicel','Flow SVG'],schools:['St. Vincent and the Grenadines Community College'],interests:['Cricket','Carnival','Volcano','Music','Church','Beach','Arrowroot'],
},

// ===== MIDDLE EAST (remaining) =====

Yemen: { weight:1, phonePrefix:'967', phoneLen:9, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Yemeni',weight:100,firstNames:['Ahmed','Fatima','Mohammed','Aisha','Ali','Sara','Hassan','Noor','Omar','Huda'],lastNames:['Al-Houthi','Saleh','Hadi','Al-Ahmar','Al-Beidh','Al-Attas'],regions:[{state:'Sana\'a',cities:['Sana\'a']},{state:'Aden',cities:['Aden']},{state:'Taiz',cities:['Taiz']},{state:'Hadhramaut',cities:['Mukalla']}]}],
  occupations:['Farmer','Teacher','Trader','Fisherman','Doctor'],companies:['MTN Yemen','SabaFon','Yemen Mobile'],schools:['Sana\'a University'],interests:['Football','Qat','Poetry','Music','Architecture','Religion','Coffee'],
},

Palestine: { weight:1, phonePrefix:'970', phoneLen:9, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Palestinian',weight:100,firstNames:['Ahmed','Lina','Mohammad','Dana','Omar','Reem','Khaled','Nour','Tariq','Sara'],lastNames:['Abbas','Barghouti','Shtayyeh','Arafat','Darwish','Kanafani','Said','Nasrallah'],regions:[{state:'West Bank',cities:['Ramallah','Nablus','Hebron','Bethlehem','Jenin']},{state:'Gaza',cities:['Gaza City','Khan Yunis','Rafah']}]}],
  occupations:['Teacher','Engineer','Doctor','NGO Worker','Businessman','Developer','Journalist'],companies:['Jawwal','Wataniya','Bank of Palestine'],schools:['Birzeit University','An-Najah University','Islamic University of Gaza'],interests:['Football','Dabke','Food','Olive Trees','Church','Poetry','Embroidery','History'],
},

Syria: { weight:1, phonePrefix:'963', phoneLen:9, emailDomains:['gmail.com','yahoo.com','outlook.com'],
  ethnicGroups:[{name:'Syrian',weight:100,firstNames:['Ahmad','Fatima','Mohammad','Nour','Omar','Sara','Khaled','Lina','Ali','Maya'],lastNames:['Al-Assad','Makhlouf','Hariri','Shalish','Tlass','Khaddam','Shara'],regions:[{state:'Damascus',cities:['Damascus']},{state:'Aleppo',cities:['Aleppo']},{state:'Homs',cities:['Homs']},{state:'Latakia',cities:['Latakia']}]}],
  occupations:['Doctor','Engineer','Teacher','Trader','Farmer','Artist','Developer'],companies:['Syriatel','MTN Syria'],schools:['University of Damascus','Aleppo University'],interests:['Football','Food','History','Music','Poetry','Church','Jasmine','Architecture'],
},

};

// ===== MICRO-NATIONS (final 8 to reach 190) =====

const MICRO_NATIONS = {

Comoros: { weight:1, phonePrefix:'269', phoneLen:7, emailDomains:['gmail.com','yahoo.fr'],
  ethnicGroups:[{name:'Comorian',weight:100,firstNames:['Ahmed','Fatima','Said','Zainaba','Ali','Hadidja'],lastNames:['Abdallah','Mohamed','Soilihi','Sambi','Djohar'],regions:[{state:'Grande Comore',cities:['Moroni']}]}],
  occupations:['Farmer','Fisherman','Teacher','Trader'],companies:['Comores Telecom'],schools:['University of Comoros'],interests:['Football','Ylang-ylang','Music','Religion','Grand Mariage'],
},

'Sao Tome and Principe': { weight:1, phonePrefix:'239', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Santomean',weight:100,firstNames:['José','Maria','Carlos','Ana','Manuel','Teresa'],lastNames:['Pinto da Costa','Trovoada','Carvalho','De Menezes'],regions:[{state:'São Tomé',cities:['São Tomé']}]}],
  occupations:['Farmer','Fisherman','Teacher','Cocoa Worker'],companies:['CST Telecom'],schools:['University of São Tomé'],interests:['Football','Chocolate','Music','Beach','Church'],
},

Andorra: { weight:1, phonePrefix:'376', phoneLen:6, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Andorran',weight:100,firstNames:['Marc','Maria','Joan','Laura','Albert','Nuria'],lastNames:['Vives','Font','Martí','López','García'],regions:[{state:'Andorra la Vella',cities:['Andorra la Vella','Escaldes-Engordany']}]}],
  occupations:['Tourism','Banker','Retail','Skiing Instructor'],companies:['Andorra Telecom','MoraBanc'],schools:['University of Andorra'],interests:['Skiing','Shopping','Mountains','Church','Football'],
},

Monaco: { weight:1, phonePrefix:'377', phoneLen:8, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Monégasque',weight:100,firstNames:['Albert','Caroline','Stéphanie','Pierre','Louis','Charlotte'],lastNames:['Grimaldi','Leclerc','Pastor','Boeri','Palmero'],regions:[{state:'Monaco',cities:['Monte Carlo','La Condamine','Fontvieille']}]}],
  occupations:['Banker','Luxury Retail','Yacht Crew','F1 Industry','Real Estate'],companies:['Monaco Telecom','SBM'],schools:['International University of Monaco'],interests:['F1 Racing','Yachting','Luxury','Casino','Football','Travel'],
},

Liechtenstein: { weight:1, phonePrefix:'423', phoneLen:7, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Liechtensteiner',weight:100,firstNames:['Hans','Anna','Peter','Maria','Lukas','Sophie'],lastNames:['Frick','Büchel','Marxer','Ospelt','Hasler','Wille'],regions:[{state:'Oberland',cities:['Vaduz']},{state:'Unterland',cities:['Schaan']}]}],
  occupations:['Banker','Engineer','Dentist','Business Owner'],companies:['Hilti','VP Bank','LGT'],schools:['University of Liechtenstein'],interests:['Skiing','Hiking','Banking','Football','Castle','Wine'],
},

'San Marino': { weight:1, phonePrefix:'378', phoneLen:10, emailDomains:['gmail.com','outlook.com'],
  ethnicGroups:[{name:'Sammarinese',weight:100,firstNames:['Marco','Maria','Luca','Giulia','Andrea','Chiara'],lastNames:['Valentini','Gasperoni','Mularoni','Ciavatta','Renzi'],regions:[{state:'San Marino',cities:['San Marino','Borgo Maggiore','Serravalle']}]}],
  occupations:['Tourism','Banker','Artisan','Civil Servant','Retail'],companies:['San Marino Telecom'],schools:['University of San Marino'],interests:['Football','F1','History','Tower','Church','Italian Food'],
},

Micronesia: { weight:1, phonePrefix:'691', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Micronesian',weight:100,firstNames:['John','Mary','David','Sarah','Peter','Grace'],lastNames:['Mori','Panuelo','Christian','Haglelgam','Olter'],regions:[{state:'Pohnpei',cities:['Palikir','Kolonia']},{state:'Chuuk',cities:['Weno']}]}],
  occupations:['Fisherman','Farmer','Teacher','Government Employee'],companies:['FSM Telecom'],schools:['College of Micronesia'],interests:['Fishing','Canoeing','Church','Traditional Navigation','Coconut'],
},

Palau: { weight:1, phonePrefix:'680', phoneLen:7, emailDomains:['gmail.com','yahoo.com'],
  ethnicGroups:[{name:'Palauan',weight:100,firstNames:['Tommy','Bilung','Surangel','Yutaka','Dirk','Sandra'],lastNames:['Remengesau','Whipps','Toribiong','Nakamura','Salii'],regions:[{state:'Koror',cities:['Koror']},{state:'Melekeok',cities:['Ngerulmud']}]}],
  occupations:['Tourism Worker','Fisherman','Farmer','Government Employee','Diver'],companies:['PNCC','Palau Telecom'],schools:['Palau Community College'],interests:['Diving','Jellyfish Lake','Church','Fishing','Nature','Traditional Storyboards'],
},

};

module.exports = { WORLD_COUNTRIES_PART3: { ...WORLD_COUNTRIES_PART3, ...MICRO_NATIONS } };
