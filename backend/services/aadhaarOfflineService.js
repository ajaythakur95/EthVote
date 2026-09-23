/**
 * Aadhaar Offline KYC Service
 *
 * Flow:
 * 1. User UIDAI se ZIP download karta hai (myaadhaar.uidai.gov.in)
 * 2. ZIP mein ek XML file hoti hai - password protected (Share Code)
 * 3. Hum ZIP extract karte hain, XML parse karte hain
 * 4. Name, DOB, Gender, District, State nikalte hain
 * 5. District se constituency auto-set hoti hai
 */

const AdmZip   = require("adm-zip");
const xml2js   = require("xml2js");
const crypto   = require("crypto");

// ── District → Constituency mapping ──────────────────────────────────────────
// Aadhaar XML mein dist field hota hai — isse constituency match karte hain
// Aap apni zaroorat ke hisaab se ye mapping extend kar sakte hain
const DISTRICT_TO_CONSTITUENCY = {
  // ── Uttar Pradesh ──────────────────────────────────────────────────────────
  "lucknow":                    "Lucknow",
  "varanasi":                   "Varanasi",
  "allahabad":                  "Allahabad",
  "prayagraj":                  "Allahabad",
  "kanpur":                     "Kanpur",
  "kanpur nagar":               "Kanpur",
  "agra":                       "Agra",
  "meerut":                     "Meerut",
  "gorakhpur":                  "Gorakhpur",
  "ghaziabad":                  "Ghaziabad",
  "gautam buddha nagar":        "Gautam Buddha Nagar",
  "mathura":                    "Mathura",
  "bareilly":                   "Bareilly",
  "aligarh":                    "Aligarh",
  "moradabad":                  "Moradabad",
  "saharanpur":                 "Saharanpur",
  "muzaffarnagar":              "Muzaffarnagar",
  "bulandshahr":                "Bulandshahr",
  "rampur":                     "Rampur",
  "sambhal":                    "Sambhal",
  "amroha":                     "Amroha",
  "hapur":                      "Hapur",
  "shahjahanpur":               "Shahjahanpur",
  "pilibhit":                   "Pilibhit",
  "lakhimpur kheri":            "Kheri",
  "sitapur":                    "Sitapur",
  "hardoi":                     "Hardoi",
  "unnao":                      "Unnao",
  "rae bareli":                 "Rae Bareli",
  "fatehpur":                   "Fatehpur",
  "pratapgarh":                 "Pratapgarh",
  "kaushambi":                  "Kaushambi",
  "banda":                      "Banda",
  "chitrakoot":                 "Chitrakoot",
  "hamirpur":                   "Hamirpur",
  "mahoba":                     "Mahoba",
  "jhansi":                     "Jhansi",
  "lalitpur":                   "Lalitpur",
  "jalaun":                     "Jalaun",
  "etawah":                     "Etawah",
  "auraiya":                    "Auraiya",
  "mainpuri":                   "Mainpuri",
  "firozabad":                  "Firozabad",
  "etah":                       "Etah",
  "kasganj":                    "Kasganj",
  "hathras":                    "Hathras",
  "farrukhabad":                "Farrukhabad",
  "kannauj":                    "Kannauj",
  "barabanki":                  "Barabanki",
  "faizabad":                   "Faizabad",
  "ambedkar nagar":             "Ambedkar Nagar",
  "sultanpur":                  "Sultanpur",
  "amethi":                     "Amethi",
  "bahraich":                   "Bahraich",
  "shravasti":                  "Shravasti",
  "balrampur":                  "Balrampur",
  "gonda":                      "Gonda",
  "siddharthnagar":             "Siddharthnagar",
  "basti":                      "Basti",
  "sant kabir nagar":           "Sant Kabir Nagar",
  "maharajganj":                "Maharajganj",
  "kushinagar":                 "Kushinagar",
  "deoria":                     "Deoria",
  "azamgarh":                   "Azamgarh",
  "mau":                        "Mau",
  "ballia":                     "Ballia",
  "jaunpur":                    "Jaunpur",
  "ghazipur":                   "Ghazipur",
  "chandauli":                  "Chandauli",
  "mirzapur":                   "Mirzapur",
  "sonbhadra":                  "Sonbhadra",
  "bijnor":                     "Bijnor",
  "badaun":                     "Badaun",

  // ── Delhi ──────────────────────────────────────────────────────────────────
  "new delhi":                  "New Delhi",
  "north delhi":                "North Delhi",
  "south delhi":                "South Delhi",
  "east delhi":                 "East Delhi",
  "west delhi":                 "West Delhi",
  "central delhi":              "Central Delhi",
  "north east delhi":           "North East Delhi",
  "north west delhi":           "North West Delhi",
  "south west delhi":           "South West Delhi",
  "shahdara":                   "Shahdara",
  "south east delhi":           "South East Delhi",

  // ── Maharashtra ────────────────────────────────────────────────────────────
  "mumbai":                     "Mumbai North",
  "mumbai city":                "Mumbai South",
  "mumbai suburban":            "Mumbai North West",
  "pune":                       "Pune",
  "nagpur":                     "Nagpur",
  "thane":                      "Thane",
  "nashik":                     "Nashik",
  "aurangabad":                 "Aurangabad",
  "solapur":                    "Solapur",
  "kolhapur":                   "Kolhapur",
  "satara":                     "Satara",
  "sangli":                     "Sangli",
  "ahmednagar":                 "Ahmednagar",
  "jalgaon":                    "Jalgaon",
  "akola":                      "Akola",
  "amravati":                   "Amravati",
  "yavatmal":                   "Yavatmal Washim",
  "nanded":                     "Nanded",
  "latur":                      "Latur",
  "osmanabad":                  "Osmanabad",
  "beed":                       "Beed",
  "parbhani":                   "Parbhani",
  "hingoli":                    "Hingoli",
  "jalna":                      "Jalna",
  "buldhana":                   "Buldhana",
  "washim":                     "Yavatmal Washim",
  "wardha":                     "Wardha",
  "bhandara":                   "Bhandara Gondiya",
  "gondiya":                    "Bhandara Gondiya",
  "gadchiroli":                 "Gadchiroli Chimur",
  "chandrapur":                 "Chandrapur",
  "raigad":                     "Raigad",
  "ratnagiri":                  "Ratnagiri Sindhudurg",
  "sindhudurg":                 "Ratnagiri Sindhudurg",
  "dhule":                      "Dhule",
  "nandurbar":                  "Nandurbar",
  "palghar":                    "Palghar",

  // ── Karnataka ──────────────────────────────────────────────────────────────
  "bengaluru":                  "Bangalore North",
  "bangalore":                  "Bangalore North",
  "bangalore urban":            "Bangalore North",
  "bangalore rural":            "Bangalore Rural",
  "mysuru":                     "Mysore",
  "mysore":                     "Mysore",
  "tumkur":                     "Tumkur",
  "kolar":                      "Kolar",
  "chikkaballapura":            "Chikkaballapur",
  "ramanagara":                 "Bangalore Rural",
  "mandya":                     "Mandya",
  "hassan":                     "Hassan",
  "chikmagalur":                "Chikmagalur",
  "kodagu":                     "Kodagu",
  "dakshina kannada":           "Dakshina Kannada",
  "udupi":                      "Udupi Chikmagalur",
  "uttara kannada":             "Uttara Kannada",
  "shivamogga":                 "Shimoga",
  "davangere":                  "Davangere",
  "chitradurga":                "Chitradurga",
  "bellary":                    "Bellary",
  "vijayanagara":               "Bellary",
  "koppal":                     "Koppal",
  "gadag":                      "Dharwad",
  "dharwad":                    "Dharwad",
  "belagavi":                   "Belgaum",
  "bagalkot":                   "Bagalkot",
  "vijayapura":                 "Bijapur",
  "bidar":                      "Bidar",
  "kalaburagi":                 "Gulbarga",
  "yadgir":                     "Gulbarga",
  "raichur":                    "Raichur",

  // ── Tamil Nadu ─────────────────────────────────────────────────────────────
  "chennai":                    "Chennai North",
  "coimbatore":                 "Coimbatore",
  "madurai":                    "Madurai",
  "tiruchirappalli":            "Tiruchirappalli",
  "salem":                      "Salem",
  "tirunelveli":                "Tirunelveli",
  "vellore":                    "Vellore",
  "erode":                      "Erode",
  "tiruppur":                   "Tiruppur",
  "thanjavur":                  "Thanjavur",
  "dindigul":                   "Dindigul",
  "ranipet":                    "Vellore",
  "kancheepuram":               "Kancheepuram",
  "chengalpattu":               "Chengalpattu",
  "villupuram":                 "Villupuram",
  "cuddalore":                  "Cuddalore",
  "nagapattinam":               "Nagapattinam",
  "tiruvarur":                  "Nagapattinam",
  "pudukkottai":                "Tiruchirappalli",
  "sivaganga":                  "Sivaganga",
  "virudhunagar":               "Virudhunagar",
  "thoothukudi":                "Thoothukudi",
  "kanniyakumari":              "Kanyakumari",
  "tenkasi":                    "Tenkasi",
  "krishnagiri":                "Krishnagiri",
  "dharmapuri":                 "Dharmapuri",
  "namakkal":                   "Namakkal",
  "ariyalur":                   "Ariyalur",
  "perambalur":                 "Perambalur",
  "tiruvallur":                 "Tiruvallur",
  "ramanathapuram":             "Ramanathapuram",
  "nilgiris":                   "Nilgiris",
  "karur":                      "Karur",
  "tirupattur":                 "Vellore",
  "mayiladuthurai":             "Nagapattinam",

  // ── Telangana ──────────────────────────────────────────────────────────────
  "hyderabad":                  "Hyderaband",
  "rangareddy":                 "Chevella",
  "medchal":                    "Secunderabad",
  "sangareddy":                 "Zahirabad",
  "medak":                      "Medak",
  "siddipet":                   "Medak",
  "nizamabad":                  "Nizamabad",
  "kamareddy":                  "Nizamabad",
  "karimnagar":                 "Karimnagar",
  "rajanna sircilla":           "Karimnagar",
  "peddapalli":                 "Peddapalle",
  "jayashankar bhupalpally":    "Bhuvanagiri",
  "warangal":                   "Warangal",
  "hanamkonda":                 "Warangal",
  "jangaon":                    "Warangal",
  "mahabubabad":                "Mahabubabad",
  "khammam":                    "Khammam",
  "bhadradri kothagudem":       "Khammam",
  "suryapet":                   "Nalgonda",
  "nalgonda":                   "Nalgonda",
  "yadadri bhuvanagiri":        "Bhuvanagiri",
  "vikarabad":                  "Chevella",
  "wanaparthy":                 "Mahbubnagar",
  "mahbubnagar":                "Mahbubnagar",
  "nagarkurnool":               "Nagarkurnool",
  "narayanpet":                 "Nagarkurnool",
  "gadwal":                     "Mahbubnagar",
  "adilabad":                   "Adilabad",
  "kumuram bheem":              "Adilabad",
  "mancherial":                 "Peddapalle",
  "nirmal":                     "Adilabad",
  "nizamabad rural":            "Nizamabad",
  "mulugu":                     "Bhuvanagiri",
  "narayanpet":                 "Nagarkurnool",

  // ── West Bengal ────────────────────────────────────────────────────────────
  "kolkata":                    "Kolkata North",
  "north 24 parganas":          "Barasat",
  "south 24 parganas":          "Diamond Harbour",
  "howrah":                     "Howrah",
  "hooghly":                    "Hooghly",
  "nadia":                      "Ranaghat",
  "murshidabad":                "Murshidabad",
  "bardhaman":                  "Bardhaman Durgapur",
  "paschim bardhaman":          "Bardhaman Durgapur",
  "purba bardhaman":            "Bardhaman Purba",
  "birbhum":                    "Birbhum",
  "bankura":                    "Bankura",
  "purulia":                    "Purulia",
  "paschim medinipur":          "Medinipur",
  "purba medinipur":            "Tamluk",
  "jhargram":                   "Jhargram",
  "malda":                      "Maldaha North",
  "north dinajpur":             "Raiganj",
  "south dinajpur":             "Balurghat",
  "darjeeling":                 "Darjeeling",
  "jalpaiguri":                 "Jalpaiguri",
  "alipurduar":                 "Alipurduar",
  "cooch behar":                "Cooch Behar",
  "uttar dinajpur":             "Raiganj",

  // ── Bihar ──────────────────────────────────────────────────────────────────
  "patna":                      "Patna Sahib",
  "gaya":                       "Gaya",
  "muzaffarpur":                "Muzaffarpur",
  "bhagalpur":                  "Bhagalpur",
  "darbhanga":                  "Darbhanga",
  "purnia":                     "Purnia",
  "rohtas":                     "Sasaram",
  "siwan":                      "Siwan",
  "gopalganj":                  "Gopalganj",
  "saran":                      "Saran",
  "vaishali":                   "Vaishali",
  "sitamarhi":                  "Sitamarhi",
  "madhubani":                  "Jhanjharpur",
  "samastipur":                 "Samastipur",
  "begusarai":                  "Begusarai",
  "munger":                     "Munger",
  "lakhisarai":                 "Munger",
  "sheikhpura":                 "Munger",
  "nalanda":                    "Nalanda",
  "nawada":                     "Nawada",
  "aurangabad":                 "Aurangabad",
  "arwal":                      "Arwal",
  "jehanabad":                  "Arrah",
  "bhojpur":                    "Arrah",
  "buxar":                      "Buxar",
  "kaimur":                     "Buxar",
  "east champaran":             "Motihari",
  "west champaran":             "Bettiah",
  "sheohar":                    "Sitamarhi",
  "madhepura":                  "Madhepura",
  "supaul":                     "Supaul",
  "araria":                     "Araria",
  "kishanganj":                 "Kishanganj",
  "katihar":                    "Katihar",
  "khagaria":                   "Khagaria",
  "banka":                      "Banka",
  "jamui":                      "Jamui",
  "jahanabad":                  "Arrah",

  // ── Rajasthan ──────────────────────────────────────────────────────────────
  "jaipur":                     "Jaipur",
  "jodhpur":                    "Jodhpur",
  "udaipur":                    "Udaipur",
  "kota":                       "Kota",
  "ajmer":                      "Ajmer",
  "bikaner":                    "Bikaner",
  "alwar":                      "Alwar",
  "bharatpur":                  "Bharatpur",
  "sikar":                      "Sikar",
  "jhunjhunu":                  "Jhunjhunu",
  "churu":                      "Churu",
  "nagaur":                     "Nagaur",
  "barmer":                     "Barmer",
  "jaisalmer":                  "Barmer",
  "pali":                       "Pali",
  "sirohi":                     "Pali",
  "jalor":                      "Pali",
  "banswara":                   "Banswara",
  "dungarpur":                  "Banswara",
  "chittorgarh":                "Chittorgarh",
  "rajsamand":                  "Rajsamand",
  "bhilwara":                   "Bhilwara",
  "tonk":                       "Tonk Sawai Madhopur",
  "sawai madhopur":             "Tonk Sawai Madhopur",
  "dausa":                      "Dausa",
  "dholpur":                    "Bharatpur",
  "karauli":                    "Karauli Dholpur",
  "baran":                      "Jhalawar Baran",
  "jhalawar":                   "Jhalawar Baran",
  "bundi":                      "Kota",
  "hanumangarh":                "Ganganagar",
  "ganganagar":                 "Ganganagar",

  // ── Gujarat ────────────────────────────────────────────────────────────────
  "ahmedabad":                  "Ahmedabad East",
  "surat":                      "Surat",
  "vadodara":                   "Vadodara",
  "rajkot":                     "Rajkot",
  "bhavnagar":                  "Bhavnagar",
  "jamnagar":                   "Jamnagar",
  "junagadh":                   "Junagadh",
  "gandhinagar":                "Gandhinagar",
  "anand":                      "Anand",
  "kheda":                      "Anand",
  "mehsana":                    "Mehsana",
  "patan":                      "Patan",
  "banaskantha":                "Banaskantha",
  "sabarkantha":                "Sabarkantha",
  "aravalli":                   "Sabarkantha",
  "mahisagar":                  "Panchmahal",
  "panchmahal":                 "Panchmahal",
  "dahod":                      "Dahod",
  "chhota udaipur":             "Chhota Udaipur",
  "narmada":                    "Bharuch",
  "bharuch":                    "Bharuch",
  "surat rural":                "Surat",
  "tapi":                       "Surat",
  "navsari":                    "Navsari",
  "valsad":                     "Valsad",
  "dang":                       "Navsari",
  "amreli":                     "Amreli",
  "gir somnath":                "Junagadh",
  "porbandar":                  "Porbandar",
  "devbhoomi dwarka":           "Jamnagar",
  "morbi":                      "Rajkot",
  "surendranagar":              "Surendranagar",
  "botad":                      "Bhavnagar",
  "kutch":                      "Kutch",

  // ── Punjab ─────────────────────────────────────────────────────────────────
  "amritsar":                   "Amritsar",
  "ludhiana":                   "Ludhiana",
  "jalandhar":                  "Jalandhar",
  "patiala":                    "Patiala",
  "bathinda":                   "Bathinda",
  "mohali":                     "Anandpur Sahib",
  "rupnagar":                   "Anandpur Sahib",
  "fatehgarh sahib":            "Fatehgarh Sahib",
  "sangrur":                    "Sangrur",
  "barnala":                    "Sangrur",
  "moga":                       "Firozpur",
  "firozpur":                   "Firozpur",
  "fazilka":                    "Firozpur",
  "muktsar":                    "Bathinda",
  "mansa":                      "Bathinda",
  "gurdaspur":                  "Gurdaspur",
  "pathankot":                  "Gurdaspur",
  "hoshiarpur":                 "Hoshiarpur",
  "nawanshahr":                 "Hoshiarpur",
  "kapurthala":                 "Jalandhar",
  "tarn taran":                 "Amritsar",
  "ferozepur":                  "Firozpur",

  // ── Haryana ────────────────────────────────────────────────────────────────
  "gurugram":                   "Gurugram",
  "gurgaon":                    "Gurugram",
  "faridabad":                  "Faridabad",
  "hisar":                      "Hisar",
  "rohtak":                     "Rohtak",
  "sonipat":                    "Sonipat",
  "panipat":                    "Sonipat",
  "karnal":                     "Karnal",
  "kurukshetra":                "Kurukshetra",
  "ambala":                     "Ambala",
  "panchkula":                  "Ambala",
  "yamunanagar":                "Ambala",
  "sirsa":                      "Sirsa",
  "fatehabad":                  "Hisar",
  "jind":                       "Hisar",
  "bhiwani":                    "Bhiwani Mahendragarh",
  "mahendragarh":               "Bhiwani Mahendragarh",
  "rewari":                     "Gurugram",
  "nuh":                        "Faridabad",
  "palwal":                     "Faridabad",
  "jhajjar":                    "Rohtak",
  "charkhi dadri":              "Bhiwani Mahendragarh",
  "kaithal":                    "Kurukshetra",

  // ── Madhya Pradesh ─────────────────────────────────────────────────────────
  "bhopal":                     "Bhopal",
  "indore":                     "Indore",
  "jabalpur":                   "Jabalpur",
  "gwalior":                    "Gwalior",
  "ujjain":                     "Ujjain",
  "sagar":                      "Sagar",
  "rewa":                       "Rewa",
  "satna":                      "Satna",
  "datia":                      "Gwalior",
  "shivpuri":                   "Guna",
  "guna":                       "Guna",
  "ashoknagar":                 "Guna",
  "vidisha":                    "Vidisha",
  "raisen":                     "Vidisha",
  "sehore":                     "Bhopal",
  "dewas":                      "Dewas",
  "shajapur":                   "Dewas",
  "agar malwa":                 "Ujjain",
  "mandsaur":                   "Mandsaur",
  "neemuch":                    "Mandsaur",
  "ratlam":                     "Ratlam",
  "jhabua":                     "Ratlam",
  "alirajpur":                  "Ratlam",
  "dhar":                       "Dhar",
  "khargone":                   "Khargone",
  "barwani":                    "Khargone",
  "khandwa":                    "Khandwa",
  "burhanpur":                  "Khandwa",
  "betul":                      "Betul",
  "hoshangabad":                "Hoshangabad",
  "narmadapuram":               "Hoshangabad",
  "harda":                      "Hoshangabad",
  "narsinghpur":                "Jabalpur",
  "chhindwara":                 "Chhindwara",
  "seoni":                      "Balaghat",
  "balaghat":                   "Balaghat",
  "mandla":                     "Mandla",
  "dindori":                    "Mandla",
  "anuppur":                    "Shahdol",
  "shahdol":                    "Shahdol",
  "umaria":                     "Shahdol",
  "katni":                      "Jabalpur",
  "damoh":                      "Damoh",
  "panna":                      "Khajuraho",
  "chhatarpur":                 "Khajuraho",
  "tikamgarh":                  "Tikamgarh",
  "niwari":                     "Tikamgarh",
  "morena":                     "Morena",
  "bhind":                      "Bhind",
  "sheopur":                    "Morena",
  "singrauli":                  "Sidhi",
  "sidhi":                      "Sidhi",

  // ── Andhra Pradesh ─────────────────────────────────────────────────────────
  "visakhapatnam":              "Visakhapatnam",
  "vijayawada":                 "Vijayawada",
  "guntur":                     "Guntur",
  "nellore":                    "Nellore",
  "kurnool":                    "Kurnool",
  "kadapa":                     "Kadapa",
  "anantapur":                  "Anantapur",
  "chittoor":                   "Chittoor",
  "krishna":                    "Machilipatnam",
  "west godavari":              "Eluru",
  "east godavari":              "Rajahmundry",
  "srikakulam":                 "Srikakulam",
  "vizianagaram":               "Vizianagaram",
  "prakasam":                   "Ongole",
  "tirupati":                   "Tirupati",
  "sri potti sriramulu nellore": "Nellore",
  "ysr kadapa":                 "Kadapa",
  "sri sathya sai":             "Anantapur",
  "nandyal":                    "Kurnool",
  "bapatla":                    "Bapatla",
  "palnadu":                    "Narasaraopet",
  "eluru":                      "Eluru",
  "alluri sitharama raju":      "Araku",
  "anakapalli":                 "Anakapalli",
  "kakinada":                   "Kakinada",
  "konaseema":                  "Amalapuram",

  // ── Kerala ─────────────────────────────────────────────────────────────────
  "thiruvananthapuram":         "Thiruvananthapuram",
  "kollam":                     "Kollam",
  "pathanamthitta":             "Pathanamthitta",
  "alappuzha":                  "Alappuzha",
  "kottayam":                   "Kottayam",
  "idukki":                     "Idukki",
  "ernakulam":                  "Ernakulam",
  "thrissur":                   "Thrissur",
  "palakkad":                   "Palakkad",
  "malappuram":                 "Malappuram",
  "kozhikode":                  "Kozhikode",
  "wayanad":                    "Wayanad",
  "kannur":                     "Kannur",
  "kasaragod":                  "Kasaragod",

  // ── Jharkhand ──────────────────────────────────────────────────────────────
  "ranchi":                     "Ranchi",
  "jamshedpur":                 "Jamshedpur",
  "dhanbad":                    "Dhanbad",
  "bokaro":                     "Giridih",
  "hazaribagh":                 "Hazaribagh",
  "giridih":                    "Giridih",
  "koderma":                    "Hazaribagh",
  "chatra":                     "Hazaribagh",
  "ramgarh":                    "Ranchi",
  "lohardaga":                  "Lohardaga",
  "gumla":                      "Lohardaga",
  "simdega":                    "Lohardaga",
  "west singhbhum":             "Singhbhum",
  "east singhbhum":             "Jamshedpur",
  "seraikela kharsawan":        "Jamshedpur",
  "dumka":                      "Dumka",
  "jamtara":                    "Dumka",
  "deoghar":                    "Godda",
  "godda":                      "Godda",
  "pakur":                      "Rajmahal",
  "sahibganj":                  "Rajmahal",
  "palamu":                     "Palamu",
  "garhwa":                     "Palamu",
  "latehar":                    "Palamu",
  "khunti":                     "Khunti",

  // ── Odisha ─────────────────────────────────────────────────────────────────
  "bhubaneswar":                "Bhubaneswar",
  "cuttack":                    "Cuttack",
  "puri":                       "Puri",
  "sambalpur":                  "Sambalpur",
  "berhampur":                  "Berhampur",
  "rourkela":                   "Sundargarh",
  "balasore":                   "Balasore",
  "bhadrak":                    "Bhadrak",
  "jajpur":                     "Jajpur",
  "kendrapara":                 "Kendrapara",
  "jagatsinghpur":              "Jagatsinghpur",
  "khordha":                    "Bhubaneswar",
  "nayagarh":                   "Puri",
  "ganjam":                     "Berhampur",
  "gajapati":                   "Berhampur",
  "rayagada":                   "Nabarangpur",
  "koraput":                    "Koraput",
  "malkangiri":                 "Koraput",
  "nabarangpur":                "Nabarangpur",
  "kalahandi":                  "Kalahandi",
  "nuapada":                    "Kalahandi",
  "bolangir":                   "Bolangir",
  "sonepur":                    "Bolangir",
  "bargarh":                    "Bargarh",
  "jharsuguda":                 "Sambalpur",
  "sundargarh":                 "Sundargarh",
  "keonjhar":                   "Keonjhar",
  "mayurbhanj":                 "Mayurbhanj",
  "dhenkanal":                  "Dhenkanal",
  "angul":                      "Dhenkanal",
  "kandhamal":                  "Kandhamal",

  // ── Assam ──────────────────────────────────────────────────────────────────
  "guwahati":                   "Guwahati",
  "dispur":                     "Guwahati",
  "kamrup":                     "Guwahati",
  "kamrup metropolitan":        "Guwahati",
  "dibrugarh":                  "Dibrugarh",
  "jorhat":                     "Jorhat",
  "sivasagar":                  "Jorhat",
  "lakhimpur":                  "Lakhimpur",
  "dhemaji":                    "Lakhimpur",
  "tinsukia":                   "Dibrugarh",
  "charaideo":                  "Dibrugarh",
  "majuli":                     "Jorhat",
  "sonitpur":                   "Tezpur",
  "biswanath":                  "Tezpur",
  "nagaon":                     "Nagaon",
  "hojai":                      "Nagaon",
  "morigaon":                   "Nagaon",
  "karbi anglong":              "Autonomous District",
  "west karbi anglong":         "Autonomous District",
  "dima hasao":                 "Autonomous District",
  "cachar":                     "Silchar",
  "hailakandi":                 "Silchar",
  "karimganj":                  "Silchar",
  "barpeta":                    "Barpeta",
  "nalbari":                    "Mangaldoi",
  "baksa":                      "Mangaldoi",
  "chirang":                    "Kokrajhar",
  "bongaigaon":                 "Barpeta",
  "goalpara":                   "Dhubri",
  "dhubri":                     "Dhubri",
  "south salmara mancachar":    "Dhubri",
  "kokrajhar":                  "Kokrajhar",
  "udalguri":                   "Mangaldoi",
  "darrang":                    "Mangaldoi",
  "golaghat":                   "Jorhat",

  // ── Chhattisgarh ───────────────────────────────────────────────────────────
  "raipur":                     "Raipur",
  "bhilai":                     "Durg",
  "durg":                       "Durg",
  "bilaspur":                   "Bilaspur",
  "korba":                      "Korba",
  "raigarh":                    "Raigarh",
  "jagdalpur":                  "Bastar",
  "bastar":                     "Bastar",
  "rajnandgaon":                "Rajnandgaon",
  "balod":                      "Durg",
  "baloda bazar":               "Raipur",
  "gariaband":                  "Raipur",
  "mahasamund":                 "Mahasamund",
  "dhamtari":                   "Mahasamund",
  "kabirdham":                  "Rajnandgaon",
  "bemetara":                   "Durg",
  "mungeli":                    "Bilaspur",
  "janjgir champa":             "Korba",
  "sakti":                      "Korba",
  "gaurella pendra marwahi":    "Bilaspur",
  "manendragarh":               "Korba",
  "surajpur":                   "Surguja",
  "surguja":                    "Surguja",
  "koriya":                     "Surguja",
  "balachandrapur":             "Raigarh",
  "jashpur":                    "Raigarh",
  "kondagaon":                  "Bastar",
  "kanker":                     "Kanker",
  "narayanpur":                 "Bastar",
  "bijapur":                    "Bastar",
  "sukma":                      "Bastar",
  "dantewada":                  "Bastar",

  // ── Uttarakhand ────────────────────────────────────────────────────────────
  "dehradun":                   "Tehri Garhwal",
  "haridwar":                   "Haridwar",
  "nainital":                   "Nainital Udhamsingh Nagar",
  "udham singh nagar":          "Nainital Udhamsingh Nagar",
  "almora":                     "Almora",
  "bageshwar":                  "Almora",
  "chamoli":                    "Pauri Garhwal",
  "rudraprayag":                "Pauri Garhwal",
  "tehri garhwal":              "Tehri Garhwal",
  "uttarkashi":                 "Tehri Garhwal",
  "pauri garhwal":              "Pauri Garhwal",
  "pithoragarh":                "Almora",
  "champawat":                  "Almora",

  // ── Himachal Pradesh ───────────────────────────────────────────────────────
  "shimla":                     "Shimla",
  "kangra":                     "Kangra",
  "mandi":                      "Mandi",
  "kullu":                      "Mandi",
  "hamirpur":                   "Hamirpur",
  "una":                        "Hamirpur",
  "bilaspur":                   "Hamirpur",
  "solan":                      "Shimla",
  "sirmaur":                    "Shimla",
  "chamba":                     "Kangra",
  "kinnaur":                    "Shimla",
  "lahaul spiti":               "Mandi",

  // ── Goa ────────────────────────────────────────────────────────────────────
  "north goa":                  "North Goa",
  "south goa":                  "South Goa",
  "panaji":                     "North Goa",

  // ── Jammu & Kashmir ────────────────────────────────────────────────────────
  "srinagar":                   "Srinagar",
  "jammu":                      "Jammu",
  "baramulla":                  "Baramulla",
  "anantnag":                   "Anantnag Rajouri",
  "kupwara":                    "Baramulla",
  "bandipora":                  "Baramulla",
  "ganderbal":                  "Srinagar",
  "budgam":                     "Srinagar",
  "pulwama":                    "Anantnag Rajouri",
  "shopian":                    "Anantnag Rajouri",
  "kulgam":                     "Anantnag Rajouri",
  "kathua":                     "Udhampur",
  "udhampur":                   "Udhampur",
  "reasi":                      "Udhampur",
  "rajouri":                    "Anantnag Rajouri",
  "poonch":                     "Anantnag Rajouri",
  "doda":                       "Udhampur",
  "kishtwar":                   "Udhampur",
  "ramban":                     "Udhampur",
  "samba":                      "Jammu",

  // ── Manipur ────────────────────────────────────────────────────────────────
  "imphal":                     "Inner Manipur",
  "imphal west":                "Inner Manipur",
  "imphal east":                "Inner Manipur",
  "thoubal":                    "Inner Manipur",
  "bishnupur":                  "Inner Manipur",
  "churachandpur":              "Outer Manipur",
  "chandel":                    "Outer Manipur",
  "senapati":                   "Outer Manipur",
  "tamenglong":                 "Outer Manipur",
  "jiribam":                    "Inner Manipur",
  "kakching":                   "Inner Manipur",
  "tengnoupal":                 "Outer Manipur",
  "kamjong":                    "Outer Manipur",
  "noney":                      "Outer Manipur",
  "pherzawl":                   "Outer Manipur",
  "kangpokpi":                  "Outer Manipur",

  // ── Meghalaya ──────────────────────────────────────────────────────────────
  "east khasi hills":           "Shillong",
  "ri bhoi":                    "Shillong",
  "west khasi hills":           "Tura",
  "south west khasi hills":     "Tura",
  "jaintia hills":              "Shillong",
  "east jaintia hills":         "Shillong",
  "west jaintia hills":         "Shillong",
  "east garo hills":            "Tura",
  "west garo hills":            "Tura",
  "south garo hills":           "Tura",
  "north garo hills":           "Tura",

  // ── Tripura ────────────────────────────────────────────────────────────────
  "west tripura":               "Tripura West",
  "east tripura":               "Tripura East",
  "north tripura":              "Tripura East",
  "south tripura":              "Tripura West",
  "gomati":                     "Tripura East",
  "sepahijala":                 "Tripura West",
  "khowai":                     "Tripura East",
  "unakoti":                    "Tripura East",

  // ── Nagaland ───────────────────────────────────────────────────────────────
  "kohima":                     "Nagaland",
  "dimapur":                    "Nagaland",
  "mokokchung":                 "Nagaland",
  "tuensang":                   "Nagaland",
  "wokha":                      "Nagaland",
  "zunheboto":                  "Nagaland",
  "phek":                       "Nagaland",
  "mon":                        "Nagaland",
  "longleng":                   "Nagaland",
  "kiphire":                    "Nagaland",
  "peren":                      "Nagaland",
  "noklak":                     "Nagaland",

  // ── Arunachal Pradesh ──────────────────────────────────────────────────────
  "itanagar":                   "Arunachal West",
  "papum pare":                 "Arunachal West",
  "east siang":                 "Arunachal East",
  "west siang":                 "Arunachal West",
  "upper siang":                "Arunachal East",
  "siang":                      "Arunachal East",
  "lower siang":                "Arunachal West",
  "east kameng":                "Arunachal West",
  "west kameng":                "Arunachal West",
  "tawang":                     "Arunachal West",
  "kurung kumey":               "Arunachal West",
  "kra daadi":                  "Arunachal West",
  "upper subansiri":            "Arunachal East",
  "lower subansiri":            "Arunachal East",
  "dibang valley":              "Arunachal East",
  "lower dibang valley":        "Arunachal East",
  "anjaw":                      "Arunachal East",
  "lohit":                      "Arunachal East",
  "namsai":                     "Arunachal East",
  "changlang":                  "Arunachal East",
  "tirap":                      "Arunachal East",
  "longding":                   "Arunachal East",

  // ── Mizoram ────────────────────────────────────────────────────────────────
  "aizawl":                     "Mizoram",
  "lunglei":                    "Mizoram",
  "champhai":                   "Mizoram",
  "kolasib":                    "Mizoram",
  "serchhip":                   "Mizoram",
  "mamit":                      "Mizoram",
  "lawngtlai":                  "Mizoram",
  "saiha":                      "Mizoram",
  "khawzawl":                   "Mizoram",
  "saitual":                    "Mizoram",
  "hnahthial":                  "Mizoram",

  // ── Sikkim ─────────────────────────────────────────────────────────────────
  "east sikkim":                "Sikkim",
  "west sikkim":                "Sikkim",
  "north sikkim":               "Sikkim",
  "south sikkim":               "Sikkim",
  "gangtok":                    "Sikkim",

  // ── Union Territories ──────────────────────────────────────────────────────
  "puducherry":                 "Puducherry",
  "pondicherry":                "Puducherry",
  "karaikal":                   "Puducherry",
  "yanam":                      "Puducherry",
  "mahe":                       "Puducherry",
  "chandigarh":                 "Chandigarh",
  "dadra and nagar haveli":     "Dadra and Nagar Haveli",
  "daman":                      "Daman and Diu",
  "diu":                        "Daman and Diu",
  "lakshadweep":                "Lakshadweep",
  "andaman":                    "Andaman and Nicobar Islands",
  "nicobar":                    "Andaman and Nicobar Islands",
  "ladakh":                     "Ladakh",
  "leh":                        "Ladakh",
  "kargil":                     "Ladakh",
};
function districtToConstituency(district) {
  if (!district) return "Other";
  const key = district.toLowerCase().trim();
  return DISTRICT_TO_CONSTITUENCY[key] || district; // fallback: district hi constituency
}

function normalizePhotoPayload(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return value.replace(/\s+/g, "").trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = normalizePhotoPayload(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const direct = normalizePhotoPayload(value._ || value["#text"] || value.text || "");
    if (direct) return direct;
    for (const nested of Object.values(value)) {
      const found = normalizePhotoPayload(nested);
      if (found) return found;
    }
  }
  return "";
}

function extractAadhaarPhotoPayload(rootNode) {
  const queue = [rootNode];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(node)) {
      const lowerKey = String(key).toLowerCase();
      if (lowerKey === "pht" || lowerKey === "photo" || lowerKey === "photograph") {
        const photo = normalizePhotoPayload(value);
        if (photo) return photo;
      }
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
}

// ── Parse Aadhaar XML ─────────────────────────────────────────────────────────
async function parseAadhaarXML(xmlString) {
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
  const result = await parser.parseStringPromise(xmlString);

  // UIDAI XML structure:
  // <OfflinePaperlessKyc uid="XXXX" ...>
  //   <UidData uid="XXXX">
  //     <Poi name="..." dob="DD-MM-YYYY" gender="M/F" .../>
  //     <Poa co="" house="" street="" lm="" loc="" vtc="" dist="Lucknow" state="Uttar Pradesh" pc="226001" po="..."/>
  //     <Pht>base64photo</Pht>
  //   </UidData>
  // </OfflinePaperlessKyc>

  const root    = result?.OfflinePaperlessKyc || result?.KycRes || result;
  const uidData = root?.UidData || root;
  const poi     = uidData?.Poi?.["$"] || uidData?.Poi || {};
  // Aadhaar XML variants:
  // - <Poa .../> (older)
  // - <Va .../>  (address tag in many offline XMLs)
  const poaRaw  = uidData?.Poa || {};
  const vaRaw   = uidData?.Va || {};
  const poa     = poaRaw?.["$"] || poaRaw;
  const va      = vaRaw?.["$"] || vaRaw;
  const addr    = (Object.keys(va || {}).length ? va : poa) || {};
  const pht     = extractAadhaarPhotoPayload(uidData) || extractAadhaarPhotoPayload(root) || null;

  // UID (last 4 digits only for display)
  const uid      = root?.["$"]?.uid || uidData?.["$"]?.uid || "";
  const uidLast4 = uid ? uid.slice(-4) : "XXXX";

  // Personal info
  const name   = poi.name   || poi.n   || "";
  const dob    = poi.dob    || poi.dob  || ""; // DD-MM-YYYY
  const gender = poi.gender || poi.g   || "";

  // Address
  const district = addr.dist || addr.district || "";
  const subdist  = addr.subdist || addr.subDistrict || addr.subdistrict || "";
  const state    = addr.state || "";
  const pincode  = addr.pc || addr.pincode || "";
  const address  = [
    addr.house, addr.street, addr.lm,
    addr.loc, addr.vtc, subdist, district, state, pincode
  ].filter(Boolean).join(", ");

  // Age calculation
  let age = null, isAdult = false;
  if (dob) {
    const parts = dob.split("-");
    let birth;
    if (parts[0].length === 4) {
      birth = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    } else {
      birth = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    age     = Math.floor((Date.now() - birth) / (365.25 * 24 * 60 * 60 * 1000));
    isAdult = age >= 18;
  }

  // Constituency from district
  const constituency = districtToConstituency(district);

  return {
    name,
    dob,
    gender,
    age,
    isAdult,
    address,
    district,
    subdist,
    state,
    pincode,
    constituency,
    uidLast4,
    photo: pht || null,
  };
}

// ── Main: Extract ZIP + Parse XML ─────────────────────────────────────────────
async function verifyAadhaarOffline(zipBuffer, shareCode) {
  let zip;

  // Try with share code as password
  try {
    zip = new AdmZip(zipBuffer);
  } catch (e) {
    throw new Error("Invalid ZIP file — sahi Aadhaar Offline ZIP upload karo");
  }

  // Find XML file inside ZIP
  const entries = zip.getEntries();
  const xmlEntry = entries.find((e) =>
    e.entryName.toLowerCase().endsWith(".xml")
  );

  if (!xmlEntry) {
    throw new Error("ZIP mein XML file nahi mili — sahi Aadhaar Offline ZIP upload karo");
  }

  // Extract with share code password
  let xmlBuffer;
  try {
    xmlBuffer = zip.readFile(xmlEntry, shareCode);
    if (!xmlBuffer) {
      // Try without password (some versions)
      xmlBuffer = xmlEntry.getData();
    }
  } catch (e) {
    throw new Error("Share Code galat hai — sahi 4-digit Share Code daalo");
  }

  if (!xmlBuffer || xmlBuffer.length === 0) {
    throw new Error("Share Code galat hai — sahi 4-digit Share Code daalo");
  }

  const xmlString = xmlBuffer.toString("utf8");

  // Parse XML
  let voterData;
  try {
    voterData = await parseAadhaarXML(xmlString);
  } catch (e) {
    throw new Error("XML parse nahi hua — valid Aadhaar Offline ZIP hai?");
  }

  if (!voterData.name) {
    throw new Error("Aadhaar data mein name nahi mila — valid ZIP hai?");
  }

  // Hash UID for storage
  const appSalt    = process.env.AADHAAR_HASH_SALT || "ethvote_salt";
  const aadhaarHash = crypto
    .createHash("sha256")
    .update((voterData.uidLast4 + voterData.name + appSalt))
    .digest("hex");

  // Blockchain hash
  let blockchainHash = null;
  try {
    const { ethers } = require("ethers");
    blockchainHash = ethers.keccak256(
      ethers.toUtf8Bytes(voterData.uidLast4 + voterData.name + appSalt)
    );
  } catch (_) {}

  return {
    ...voterData,
    aadhaarHash,
    blockchainHash,
    verified: true,
    source: "aadhaar_offline_kyc",
  };
}

module.exports = { verifyAadhaarOffline };