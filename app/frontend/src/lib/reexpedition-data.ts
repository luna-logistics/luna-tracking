/**
 * Editorial content for the Réexpédition page (from the "Reexpedition Luna"
 * Claude Design handoff, 2026-09-14). Kept here — bilingual, one object per
 * item — rather than in the i18n locale files: it is long-form editorial
 * copy (eight detailed case studies, a 10-item FAQ, a glossary…) that the
 * team edits with us, not through the CMS. Short/structural strings and all
 * form copy stay in `forwarding.*` i18n and remain admin-editable.
 */
export type Lang = 'fr' | 'en';
type L = { fr: string; en: string };
const pick = (v: L, l: Lang) => (l === 'en' ? v.en : v.fr);

type Opt = { code: string; label: L };
const ORIGINS: Opt[] = [
  { code: 'US', label: { fr: 'États-Unis', en: 'United States' } },
  { code: 'CA', label: { fr: 'Canada', en: 'Canada' } },
  { code: 'CN', label: { fr: 'Chine', en: 'China' } },
  { code: 'BE', label: { fr: 'Belgique / Europe', en: 'Belgium / Europe' } },
  { code: 'AE', label: { fr: 'Dubaï (Émirats)', en: 'Dubai (UAE)' } },
  { code: 'TR', label: { fr: 'Turquie', en: 'Turkey' } },
  { code: 'CD', label: { fr: 'Congo (RDC)', en: 'Congo (DRC)' } },
  { code: 'XX', label: { fr: 'Autre', en: 'Other' } },
];
const DESTINATIONS: Opt[] = [
  { code: 'CD-KIN', label: { fr: 'Kinshasa', en: 'Kinshasa' } },
  { code: 'CD-MAT', label: { fr: 'Matadi', en: 'Matadi' } },
  { code: 'CD-FBM', label: { fr: 'Lubumbashi (bientôt)', en: 'Lubumbashi (soon)' } },
  { code: 'CD-OTH', label: { fr: 'Autre ville de RDC (bientôt)', en: 'Other DRC city (soon)' } },
  { code: 'US', label: { fr: 'États-Unis', en: 'United States' } },
  { code: 'CA', label: { fr: 'Canada', en: 'Canada' } },
  { code: 'EU', label: { fr: 'Europe', en: 'Europe' } },
];

type CaseRaw = {
  id: string; dir: 'vers' | 'depuis'; fromCode: string; toCode: string;
  mode: L; title: L; situation: L; actions: L[]; tracking: L; note: L; heroTitle: L; heroText: L;
};
const CASES: CaseRaw[] = [
  {
    id: 'c1', dir: 'vers', fromCode: 'US', toCode: 'CD', mode: { fr: 'Aérien', en: 'Air' },
    title: { fr: '« J’ai commandé sur Amazon, mais ils ne livrent pas au Congo. »', en: '"I ordered on Amazon, but they don’t deliver to the Congo."' },
    situation: { fr: 'Vous achetez sur un site américain. Au moment de payer, aucune adresse congolaise n’est acceptée. Votre commande est prête, mais elle n’a nulle part où aller.', en: 'You buy on a US site. At checkout, no Congolese address is accepted. Your order is ready, but it has nowhere to go.' },
    actions: [
      { fr: 'Vous faites livrer votre commande à l’adresse de notre partenaire aux États-Unis, que nous vous communiquons.', en: 'You have your order delivered to our partner’s address in the United States, which we give you.' },
      { fr: 'Notre partenaire réceptionne le colis, vérifie qu’il correspond à ce que vous avez annoncé et le stocke.', en: 'Our partner receives the parcel, checks it matches what you declared, and stores it.' },
      { fr: 'Nous le regroupons avec les autres envois du même départ et l’expédions en aérien vers Kinshasa.', en: 'We consolidate it with the other shipments on the same departure and ship it by air to Kinshasa.' },
    ],
    tracking: { fr: 'Le colis apparaît dans votre espace dès sa réception aux États-Unis, avant même son départ.', en: 'The parcel appears in your account as soon as it is received in the United States, even before it leaves.' },
    note: { fr: 'Les départs sont groupés : un colis arrivé juste après un départ attend le suivant. C’est ce regroupement qui rend le prix supportable.', en: 'Departures are grouped: a parcel arriving just after a departure waits for the next one. That consolidation is what keeps the price bearable.' },
    heroTitle: { fr: 'États-Unis → Kinshasa, en aérien.', en: 'United States → Kinshasa, by air.' },
    heroText: { fr: 'Notre partenaire aux États-Unis récupère votre colis, nous le regroupons avec d’autres envois, et il part en aérien. Suivi disponible dès la prise en charge.', en: 'Our partner in the US collects your parcel, we consolidate it with other shipments, and it leaves by air. Tracking available from pickup.' },
  },
  {
    id: 'c2', dir: 'depuis', fromCode: 'CD', toCode: 'US → CD', mode: { fr: 'Aérien', en: 'Air' },
    title: { fr: '« Je vis à Kinshasa et mon colis est bloqué aux États-Unis. »', en: '"I live in Kinshasa and my parcel is stuck in the United States."' },
    situation: { fr: 'Vous êtes au pays. Vous avez acheté du matériel en ligne aux États-Unis et vous l’avez fait livrer chez un ami, un cousin ou un ancien collègue. Le colis dort chez lui depuis des semaines. Vous ne pouvez pas y aller, et lui n’a ni le temps ni l’envie de gérer un envoi international.', en: 'You are back home. You bought equipment online in the US and had it delivered to a friend, cousin or former colleague. The parcel has sat there for weeks. You can’t go, and they have neither the time nor the wish to handle an international shipment.' },
    actions: [
      { fr: 'Vous nous donnez l’adresse où se trouve le colis et les coordonnées de la personne qui le détient.', en: 'You give us the address where the parcel is and the contact details of the person holding it.' },
      { fr: 'Nous contactons notre correspondant sur place. C’est lui qui prend rendez-vous, se déplace et récupère physiquement le paquet — votre proche n’a rien d’autre à faire que d’ouvrir la porte.', en: 'We contact our local correspondent. They make the appointment, travel and physically collect the parcel — your relative only has to open the door.' },
      { fr: 'Le colis rejoint notre point de regroupement, puis part vers Kinshasa. Vous êtes prévenu à chaque changement d’étape.', en: 'The parcel reaches our consolidation point, then leaves for Kinshasa. You are notified at every step change.' },
    ],
    tracking: { fr: 'Le suivi démarre au moment de la récupération : vous savez que le colis a quitté le domicile de votre proche, sans avoir à lui téléphoner pour le demander.', en: 'Tracking starts at pickup: you know the parcel has left your relative’s home without having to call them to ask.' },
    note: { fr: 'Nous avons besoin de l’accord de la personne qui détient le colis, et d’une description de ce qu’il contient. Sans ces deux éléments, notre correspondant ne peut pas intervenir.', en: 'We need the agreement of the person holding the parcel, and a description of its contents. Without both, our correspondent cannot step in.' },
    heroTitle: { fr: 'Vous êtes au Congo, la marchandise est ailleurs.', en: 'You are in the Congo, the goods are elsewhere.' },
    heroText: { fr: 'Notre correspondant sur place va physiquement chercher le colis là où il se trouve, puis nous l’expédions vers Kinshasa. Vous suivez tout en ligne.', en: 'Our local correspondent physically collects the parcel where it is, then we ship it to Kinshasa. You follow everything online.' },
  },
  {
    id: 'c3', dir: 'vers', fromCode: 'CA', toCode: 'CD', mode: { fr: 'Aérien', en: 'Air' },
    title: { fr: '« Mon fils a laissé ses affaires à Montréal en rentrant. »', en: '"My son left his belongings in Montreal when he came home."' },
    situation: { fr: 'Un proche quitte le Canada et laisse derrière lui des cartons : vêtements, ordinateur, livres, matériel de cuisine. Ils sont stockés chez un logeur ou un ami. Personne sur place n’a envie de gérer un envoi vers l’Afrique, et les transporteurs classiques demandent des dimensions et des étiquettes que personne ne sait produire.', en: 'A relative leaves Canada and leaves boxes behind: clothes, a computer, books, kitchen gear. They are stored at a landlord’s or a friend’s. No one there wants to handle a shipment to Africa, and ordinary carriers ask for dimensions and labels no one knows how to produce.' },
    actions: [
      { fr: 'Notre correspondant au Canada se rend sur place, récupère les cartons et vérifie leur contenu avec vous.', en: 'Our correspondent in Canada goes on site, collects the boxes and checks their contents with you.' },
      { fr: 'Il reconditionne ce qui doit l’être — un carton mal fermé n’arrive jamais entier — et pèse l’ensemble.', en: 'They repack what needs it — a badly closed box never arrives intact — and weigh the lot.' },
      { fr: 'Nous vous confirmons le tarif définitif sur la base du poids réel, puis nous expédions.', en: 'We confirm the final price based on the actual weight, then we ship.' },
    ],
    tracking: { fr: 'Le poids et le nombre de colis sont mis à jour dans votre espace après la récupération, avant l’expédition : vous validez en connaissance de cause.', en: 'Weight and parcel count are updated in your account after pickup, before shipping: you approve knowing the facts.' },
    note: { fr: 'Les appareils avec batterie au lithium (ordinateurs, téléphones, batteries externes) suivent des règles de transport strictes. Signalez-les : ils voyagent, mais pas n’importe comment.', en: 'Devices with lithium batteries (computers, phones, power banks) follow strict transport rules. Flag them: they travel, but not any which way.' },
    heroTitle: { fr: 'Canada → Kinshasa, en aérien.', en: 'Canada → Kinshasa, by air.' },
    heroText: { fr: 'Notre correspondant récupère les cartons sur place, les reconditionne et les pèse ; le tarif définitif vous est confirmé avant le départ.', en: 'Our correspondent collects the boxes on site, repacks and weighs them; the final price is confirmed before departure.' },
  },
  {
    id: 'c4', dir: 'vers', fromCode: 'CN', toCode: 'CD', mode: { fr: 'Maritime', en: 'Sea' },
    title: { fr: '« J’achète du stock à Guangzhou pour le revendre au pays. »', en: '"I buy stock in Guangzhou to resell back home."' },
    situation: { fr: 'Vous êtes commerçant·e. Vous avez trouvé un fournisseur en Chine, la marchandise est prête en usine, mais vous n’avez ni container complet, ni transitaire, ni la moindre idée de la procédure douanière à Matadi.', en: 'You are a trader. You found a supplier in China, the goods are ready at the factory, but you have no full container, no freight forwarder, and no idea of the customs procedure at Matadi.' },
    actions: [
      { fr: 'Notre partenaire récupère votre marchandise à l’usine ou à l’entrepôt du fournisseur.', en: 'Our partner collects your goods at the factory or the supplier’s warehouse.' },
      { fr: 'Nous la plaçons en groupage : vous ne payez que la place que vous occupez dans le container, pas le container entier.', en: 'We place it in groupage: you only pay for the space you take in the container, not the whole container.' },
      { fr: 'Le container part par bateau vers Matadi, puis nous organisons l’acheminement routier jusqu’à Kinshasa.', en: 'The container leaves by ship to Matadi, then we arrange the road leg to Kinshasa.' },
    ],
    tracking: { fr: 'Les grandes étapes sont visibles : départ usine, mise en container, départ du port, arrivée à Matadi, dédouanement, route vers Kinshasa.', en: 'The main steps are visible: factory departure, loading into the container, port departure, arrival at Matadi, customs clearance, road to Kinshasa.' },
    note: { fr: 'Le maritime est nettement moins cher que l’aérien, mais il se compte en semaines, pas en jours. Anticipez vos saisons de vente.', en: 'Sea is far cheaper than air, but it is counted in weeks, not days. Plan ahead for your selling seasons.' },
    heroTitle: { fr: 'Chine → Matadi puis Kinshasa, en maritime.', en: 'China → Matadi then Kinshasa, by sea.' },
    heroText: { fr: 'Enlèvement chez le fournisseur, groupage en container, bateau jusqu’à Matadi puis route vers Kinshasa. Vous ne payez que la place occupée.', en: 'Pickup at the supplier, groupage in a container, ship to Matadi then road to Kinshasa. You only pay for the space used.' },
  },
  {
    id: 'c5', dir: 'depuis', fromCode: 'CD', toCode: 'CN → CD', mode: { fr: 'Maritime', en: 'Sea' },
    title: { fr: '« J’ai payé un fournisseur chinois, et depuis, plus de nouvelles. »', en: '"I paid a Chinese supplier, and since then, no news."' },
    situation: { fr: 'Vous avez commandé et payé depuis Kinshasa. Le fournisseur dit que la marchandise est prête, mais personne n’est allé la voir. Vous ne savez pas si elle existe, si elle correspond, ni comment la faire sortir de Chine.', en: 'You ordered and paid from Kinshasa. The supplier says the goods are ready, but no one has seen them. You don’t know if they exist, whether they match, or how to get them out of China.' },
    actions: [
      { fr: 'Notre correspondant se rend chez le fournisseur, contrôle que la marchandise correspond à votre commande et vous envoie des photos.', en: 'Our correspondent visits the supplier, checks the goods match your order and sends you photos.' },
      { fr: 'Une fois votre accord donné, il prend en charge la marchandise et l’amène au point de groupage.', en: 'Once you approve, they take charge of the goods and bring them to the groupage point.' },
      { fr: 'Nous organisons le transport maritime, le passage portuaire et la livraison finale.', en: 'We arrange the sea transport, the port passage and the final delivery.' },
    ],
    tracking: { fr: 'La vérification sur place apparaît comme une étape à part entière, avec les photos attachées à votre dossier.', en: 'The on-site check appears as a step in its own right, with the photos attached to your file.' },
    note: { fr: 'Cette vérification se fait avant l’expédition, jamais après. C’est le seul moment où un problème avec le fournisseur peut encore se régler.', en: 'This check happens before shipping, never after. It is the only moment when a problem with the supplier can still be sorted out.' },
    heroTitle: { fr: 'Vérification chez le fournisseur, puis maritime.', en: 'Check at the supplier, then by sea.' },
    heroText: { fr: 'Notre correspondant contrôle la marchandise sur place et vous envoie des photos avant tout départ. Ensuite, groupage et transport maritime.', en: 'Our correspondent checks the goods on site and sends you photos before any departure. Then groupage and sea transport.' },
  },
  {
    id: 'c6', dir: 'vers', fromCode: 'BE', toCode: 'CD', mode: { fr: 'Aérien ou maritime', en: 'Air or sea' },
    title: { fr: '« J’ai acheté en Europe, je veux l’envoyer au pays. »', en: '"I bought in Europe, I want to send it home."' },
    situation: { fr: 'Vous vivez en Belgique, en France ou aux Pays-Bas. Vous avez accumulé des achats en ligne, ou vous voulez envoyer des affaires à votre famille. Vous n’avez pas de voiture, ou pas de temps.', en: 'You live in Belgium, France or the Netherlands. You have piled up online purchases, or you want to send things to your family. You have no car, or no time.' },
    actions: [
      { fr: 'Vous faites livrer vos achats à notre adresse à Ixelles, ou nous organisons la collecte chez vous.', en: 'You have your purchases delivered to our address in Ixelles, or we arrange collection at your place.' },
      { fr: 'Nous regroupons, pesons et emballons correctement l’ensemble.', en: 'We consolidate, weigh and properly pack the whole lot.' },
      { fr: 'Nous expédions selon l’urgence : aérien si c’est pressé, maritime si le volume est important et que vous pouvez attendre.', en: 'We ship according to urgency: air if it is pressing, sea if the volume is large and you can wait.' },
    ],
    tracking: { fr: 'Chaque colis reçu à Ixelles est enregistré individuellement : vous voyez arriver vos commandes une par une.', en: 'Each parcel received in Ixelles is logged individually: you see your orders arrive one by one.' },
    note: { fr: 'Plusieurs petits colis regroupés en un seul envoi coûtent moins cher que plusieurs envois séparés. Attendez d’en avoir quelques-uns.', en: 'Several small parcels combined into one shipment cost less than several separate shipments. Wait until you have a few.' },
    heroTitle: { fr: 'Belgique / Europe → Congo.', en: 'Belgium / Europe → Congo.' },
    heroText: { fr: 'Vous faites livrer chez nous à Ixelles ou nous collectons chez vous ; nous regroupons, pesons, emballons, puis nous expédions en aérien ou en maritime.', en: 'You have it delivered to us in Ixelles or we collect at your place; we consolidate, weigh, pack, then ship by air or sea.' },
  },
  {
    id: 'c7', dir: 'vers', fromCode: 'AE / TR', toCode: 'CD', mode: { fr: 'Aérien', en: 'Air' },
    title: { fr: '« Je fais mes achats à Dubaï, mais je rentre avant la marchandise. »', en: '"I shop in Dubai, but I fly home before the goods."' },
    situation: { fr: 'Vous partez acheter du textile ou de l’électronique sur place. Vous ne pouvez pas tout ramener en soute, et vos fournisseurs ne savent pas expédier vers le Congo.', en: 'You travel to buy textiles or electronics on site. You can’t bring it all back in the hold, and your suppliers don’t know how to ship to the Congo.' },
    actions: [
      { fr: 'Vous laissez la marchandise chez notre partenaire local, ou vous lui demandez de la retirer chez le fournisseur après votre départ.', en: 'You leave the goods with our local partner, or ask them to pick it up from the supplier after you leave.' },
      { fr: 'Il la conditionne et l’enregistre à votre nom.', en: 'They pack it and register it in your name.' },
      { fr: 'Nous l’expédions vers Kinshasa et vous la suivez comme n’importe quel envoi Luna.', en: 'We ship it to Kinshasa and you track it like any Luna shipment.' },
    ],
    tracking: { fr: 'Votre envoi est déjà visible dans votre espace pendant que vous êtes encore dans l’avion.', en: 'Your shipment is already visible in your account while you are still on the plane.' },
    note: { fr: 'Gardez les factures d’achat. Elles servent à la déclaration en douane, et sans elles la valeur de vos marchandises est estimée à votre place.', en: 'Keep the purchase invoices. They are used for the customs declaration, and without them the value of your goods is estimated for you.' },
    heroTitle: { fr: 'Dubaï ou Turquie → Kinshasa, en aérien.', en: 'Dubai or Turkey → Kinshasa, by air.' },
    heroText: { fr: 'Vous laissez la marchandise chez notre partenaire local — ou il la retire chez le fournisseur après votre départ — et nous l’expédions à votre nom.', en: 'You leave the goods with our local partner — or they collect them from the supplier after you leave — and we ship them in your name.' },
  },
  {
    id: 'c8', dir: 'depuis', fromCode: 'CD', toCode: 'EU', mode: { fr: 'Aérien', en: 'Air' },
    title: { fr: '« Je dois envoyer un document ou un échantillon depuis Kinshasa. »', en: '"I need to send a document or a sample from Kinshasa."' },
    situation: { fr: 'Vous êtes à Kinshasa et vous devez faire parvenir quelque chose en Europe : dossier administratif, échantillon produit, pièce de rechange.', en: 'You are in Kinshasa and need to get something to Europe: an administrative file, a product sample, a spare part.' },
    actions: [
      { fr: 'Nous récupérons l’envoi à Kinshasa, chez vous ou à notre point de dépôt.', en: 'We collect the shipment in Kinshasa, at your place or at our drop-off point.' },
      { fr: 'Nous préparons les documents d’export nécessaires.', en: 'We prepare the necessary export documents.' },
      { fr: 'L’envoi part en aérien vers l’Europe et vous recevez la confirmation de remise.', en: 'The shipment leaves by air to Europe and you receive the delivery confirmation.' },
    ],
    tracking: { fr: 'Le même suivi que dans l’autre sens, y compris la preuve de livraison à l’arrivée.', en: 'The same tracking as the other way round, including proof of delivery on arrival.' },
    note: { fr: 'Les envois au départ du Congo demandent un délai de préparation documentaire supplémentaire. Prévoyez large si vous avez une date limite.', en: 'Shipments leaving the Congo need extra document-preparation time. Allow plenty if you have a deadline.' },
    heroTitle: { fr: 'Congo → Europe, en aérien.', en: 'Congo → Europe, by air.' },
    heroText: { fr: 'Nous récupérons l’envoi à Kinshasa, préparons les documents d’export et l’expédions en aérien, avec preuve de livraison à l’arrivée.', en: 'We collect the shipment in Kinshasa, prepare the export documents and ship it by air, with proof of delivery on arrival.' },
  },
];

const ROUTE_MAP: Record<string, string> = {
  'US|CD-KIN': 'c1', 'US|CD-MAT': 'c1', 'US|CD-FBM': 'c1', 'US|CD-OTH': 'c1',
  'CA|CD-KIN': 'c3', 'CA|CD-MAT': 'c3', 'CA|CD-FBM': 'c3', 'CA|CD-OTH': 'c3',
  'CN|CD-KIN': 'c4', 'CN|CD-MAT': 'c4', 'CN|CD-FBM': 'c4', 'CN|CD-OTH': 'c4',
  'BE|CD-KIN': 'c6', 'BE|CD-MAT': 'c6', 'BE|CD-FBM': 'c6', 'BE|CD-OTH': 'c6',
  'AE|CD-KIN': 'c7', 'AE|CD-MAT': 'c7', 'TR|CD-KIN': 'c7', 'TR|CD-MAT': 'c7',
  'CD|US': 'c2', 'CD|CA': 'c2', 'CD|EU': 'c8', 'CD|CD-KIN': 'c2', 'CD|CD-MAT': 'c2',
};

const STEPS: { n: string; title: L; body: L }[] = [
  { n: '1', title: { fr: 'Vous nous décrivez votre envoi', en: 'You describe your shipment' }, body: { fr: 'Où se trouve la marchandise, ce que c’est, où elle doit aller. Quelques lignes suffisent — pas besoin de connaître le poids exact ni les dimensions au centimètre. Si vous avez un numéro de commande ou une photo, joignez-les, ça accélère tout.', en: 'Where the goods are, what they are, where they must go. A few lines are enough — no need for the exact weight or dimensions to the centimetre. If you have an order number or a photo, add them, it speeds everything up.' } },
  { n: '2', title: { fr: 'Nous confirmons le plan et le tarif', en: 'We confirm the plan and the price' }, body: { fr: 'Nous vous répondons avec un plan de transport (qui récupère, par où ça passe, en combien de temps) et un tarif indicatif. Tant que vous n’avez pas validé, rien n’est engagé et rien n’est facturé.', en: 'We reply with a transport plan (who collects, the route, how long) and an indicative price. Until you approve, nothing is committed and nothing is billed.' } },
  { n: '3', title: { fr: 'Notre partenaire local récupère la marchandise', en: 'Our local partner collects the goods' }, body: { fr: 'Un associé Luna sur place va chercher le colis à l’adresse indiquée — chez un particulier, dans un entrepôt, chez un fournisseur, ou dans un point relais. Il l’apporte à notre point de regroupement.', en: 'A Luna associate on site fetches the parcel at the given address — at a home, a warehouse, a supplier, or a pickup point. They bring it to our consolidation point.' } },
  { n: '4', title: { fr: 'Nous regroupons, nous expédions, vous suivez', en: 'We consolidate, we ship, you track' }, body: { fr: 'Votre envoi part avec d’autres vers la même destination : c’est ce qui fait baisser le prix. Dès la prise en charge, votre numéro de suivi Luna est actif, et vous voyez l’avancement à chaque étape jusqu’à la livraison.', en: 'Your shipment leaves with others to the same destination: that is what lowers the price. From pickup, your Luna tracking number is active, and you see progress at each step until delivery.' } },
];

const COMPARE: { label: L; air: L; sea: L }[] = [
  { label: { fr: 'Pour quoi', en: 'What for' }, air: { fr: 'Petits volumes, marchandises urgentes, objets de valeur', en: 'Small volumes, urgent goods, valuables' }, sea: { fr: 'Gros volumes, meubles, stock commercial', en: 'Large volumes, furniture, commercial stock' } },
  { label: { fr: 'Le prix se calcule sur', en: 'Price is based on' }, air: { fr: 'Le poids', en: 'Weight' }, sea: { fr: 'Le volume (le mètre cube)', en: 'Volume (the cubic metre)' } },
  { label: { fr: 'Délai', en: 'Transit time' }, air: { fr: 'Le plus rapide', en: 'The fastest' }, sea: { fr: 'Nettement plus long', en: 'Much longer' } },
  { label: { fr: 'Bon réflexe', en: 'Rule of thumb' }, air: { fr: 'Si ça tient dans deux valises, c’est probablement de l’aérien', en: 'If it fits in two suitcases, it is probably air' }, sea: { fr: 'Si ça remplit une pièce, c’est du maritime', en: 'If it fills a room, it is sea' } },
];

const GLOSSARY: { term: L; def: L }[] = [
  { term: { fr: 'Réexpédition', en: 'Forwarding' }, def: { fr: 'Renvoyer un colis depuis l’endroit où il se trouve vers sa vraie destination.', en: 'Sending a parcel on from where it is to its real destination.' } },
  { term: { fr: 'Groupage (ou consolidation)', en: 'Groupage (or consolidation)' }, def: { fr: 'Mettre votre envoi avec ceux d’autres clients dans le même avion ou le même container. Vous partagez le coût du transport au lieu de le payer seul. C’est le principe qui rend Luna abordable.', en: 'Putting your shipment with those of other customers in the same plane or container. You share the transport cost instead of paying it alone. That is what makes Luna affordable.' } },
  { term: { fr: 'Transitaire', en: 'Freight forwarder' }, def: { fr: 'L’entreprise qui organise le voyage complet d’une marchandise : les camions, le bateau, les papiers, la douane. C’est le métier de Luna.', en: 'The company that organises a shipment’s whole journey: the trucks, the ship, the paperwork, customs. That is Luna’s job.' } },
  { term: { fr: 'Dédouanement', en: 'Customs clearance' }, def: { fr: 'Le passage par l’administration du pays d’arrivée, qui vérifie ce que contient l’envoi et calcule les taxes à payer.', en: 'The step through the destination country’s administration, which checks the shipment’s contents and calculates the taxes due.' } },
  { term: { fr: 'Poids volumétrique', en: 'Volumetric weight' }, def: { fr: 'Un carton de plumes prend autant de place qu’un carton de livres. Les transporteurs facturent donc parfois sur la place occupée plutôt que sur le poids réel. C’est pour ça qu’on vous demande les dimensions.', en: 'A box of feathers takes as much room as a box of books. Carriers therefore sometimes charge on space used rather than actual weight. That is why we ask for dimensions.' } },
  { term: { fr: 'Point de consolidation', en: 'Consolidation point' }, def: { fr: 'L’entrepôt où l’on regroupe les colis avant de les faire partir ensemble.', en: 'The warehouse where parcels are grouped before they leave together.' } },
];

const REFUSED: L[] = [
  { fr: 'Argent liquide et objets de valeur non déclarés', en: 'Cash and undeclared valuables' },
  { fr: 'Armes', en: 'Weapons' },
  { fr: 'Produits inflammables ou corrosifs', en: 'Flammable or corrosive products' },
  { fr: 'Substances illégales', en: 'Illegal substances' },
  { fr: 'Denrées périssables non conditionnées', en: 'Unpackaged perishable goods' },
  { fr: 'Contrefaçons', en: 'Counterfeit goods' },
  { fr: 'Animaux vivants', en: 'Live animals' },
];

const MOCK: { active: boolean; label: L; meta: L }[] = [
  { active: true, label: { fr: 'Colis récupéré chez le détenteur', en: 'Parcel collected from the holder' }, meta: { fr: 'Newark, États-Unis', en: 'Newark, United States' } },
  { active: true, label: { fr: 'Reçu au point de regroupement', en: 'Received at the consolidation point' }, meta: { fr: 'Vérification du contenu et pesée', en: 'Content check and weighing' } },
  { active: true, label: { fr: 'Départ de l’envoi groupé', en: 'Consolidated shipment departed' }, meta: { fr: 'Aérien', en: 'Air' } },
  { active: false, label: { fr: 'Dédouanement à l’arrivée', en: 'Customs clearance on arrival' }, meta: { fr: 'À venir', en: 'Upcoming' } },
  { active: false, label: { fr: 'Livraison au destinataire', en: 'Delivery to the recipient' }, meta: { fr: 'Kinshasa — à venir', en: 'Kinshasa — upcoming' } },
];

const CHIPS: L[] = [
  { fr: 'Vêtements', en: 'Clothes' },
  { fr: 'Électronique', en: 'Electronics' },
  { fr: 'Cartons d’affaires personnelles', en: 'Boxes of personal effects' },
  { fr: 'Pièces auto', en: 'Car parts' },
  { fr: 'Matériel professionnel', en: 'Professional equipment' },
  { fr: 'Documents', en: 'Documents' },
  { fr: 'Autre', en: 'Other' },
];

const QUANTITIES: L[] = [
  { fr: 'Un ou deux colis', en: 'One or two parcels' },
  { fr: 'Plusieurs cartons', en: 'Several boxes' },
  { fr: 'Une palette ou plus', en: 'A pallet or more' },
  { fr: 'Je ne sais pas encore', en: 'I don’t know yet' },
];

const FAQS: { q: L; a: L }[] = [
  { q: { fr: 'Combien coûte une réexpédition ?', en: 'How much does forwarding cost?' }, a: { fr: 'Le tarif dépend du poids, du volume, du pays de départ et du mode de transport choisi. Nous ne publions pas de grille de prix parce qu’elle serait fausse une fois sur deux : décrivez votre envoi et nous vous donnons un tarif indicatif dans le devis.', en: 'The price depends on weight, volume, country of departure and the chosen transport mode. We do not publish a price grid because it would be wrong half the time: describe your shipment and we give you an indicative price in the quote.' } },
  { q: { fr: 'Combien de temps ça prend ?', en: 'How long does it take?' }, a: { fr: 'L’aérien se compte en jours, le maritime en semaines, et il faut y ajouter le temps de récupération sur place et le passage en douane. Nous vous donnons un délai estimé pour votre corridor précis dans la réponse au devis.', en: 'Air is counted in days, sea in weeks, plus the on-site pickup time and customs. We give you an estimated time for your specific corridor in the quote reply.' } },
  { q: { fr: 'Qui paie les frais de douane à l’arrivée ?', en: 'Who pays the customs fees on arrival?' }, a: { fr: 'Les droits et taxes du pays d’arrivée sont à la charge du destinataire, sauf accord contraire indiqué dans votre devis. Nous vous expliquons à l’avance ce qui sera dû et comment c’est facturé.', en: 'Duties and taxes in the destination country are the recipient’s responsibility, unless otherwise agreed in your quote. We explain in advance what will be due and how it is billed.' } },
  { q: { fr: 'Je vis au Congo et mon colis est à l’étranger : vous pouvez aller le chercher ?', en: 'I live in the Congo and my parcel is abroad: can you go and get it?' }, a: { fr: 'Oui — c’est précisément ce que nous faisons. Notre correspondant sur place se déplace, récupère le colis à l’adresse indiquée et l’apporte à notre point de regroupement. Nous avons besoin de l’adresse, de l’accord de la personne qui détient le colis, et d’une description du contenu.', en: 'Yes — that is exactly what we do. Our correspondent on site travels, collects the parcel at the given address and brings it to our consolidation point. We need the address, the agreement of the person holding it, and a description of the contents.' } },
  { q: { fr: 'Comment vous faites pour récupérer un colis chez un particulier ?', en: 'How do you collect a parcel from a private person?' }, a: { fr: 'Notre correspondant prend contact avec la personne, fixe un rendez-vous et passe récupérer le paquet. Votre proche n’a rien à emballer ni à étiqueter : il ouvre la porte, c’est tout.', en: 'Our correspondent contacts the person, sets an appointment and comes to collect the parcel. Your relative has nothing to pack or label: they open the door, that is all.' } },
  { q: { fr: 'Que se passe-t-il si mon colis est perdu ou abîmé ?', en: 'What happens if my parcel is lost or damaged?' }, a: { fr: 'Chaque envoi est enregistré et tracé à chaque étape, ce qui permet d’identifier où le problème est survenu. Les conditions de couverture et les montants sont précisés dans votre devis ; nous ne les annonçons pas ici tant qu’ils ne sont pas confirmés.', en: 'Every shipment is logged and traced at each step, which lets us identify where the problem occurred. Coverage terms and amounts are set out in your quote; we do not state them here until confirmed.' } },
  { q: { fr: 'Est-ce que je peux regrouper plusieurs commandes en un seul envoi ?', en: 'Can I combine several orders into one shipment?' }, a: { fr: 'Oui, et c’est recommandé : plusieurs petits colis expédiés ensemble coûtent moins cher que plusieurs envois séparés. Vos colis sont enregistrés un par un à leur arrivée chez nous, puis partent groupés.', en: 'Yes, and it is recommended: several small parcels shipped together cost less than several separate shipments. Your parcels are logged one by one on arrival, then leave grouped.' } },
  { q: { fr: 'Vous livrez ailleurs qu’à Kinshasa ?', en: 'Do you deliver anywhere other than Kinshasa?' }, a: { fr: 'Kinshasa est notre destination active. Matadi est desservi dans le cadre des envois maritimes, et d’autres villes de RDC sont annoncées comme « bientôt disponible ». Demandez-nous : si nous ne pouvons pas encore livrer chez vous, nous vous le disons tout de suite.', en: 'Kinshasa is our active destination. Matadi is served as part of sea shipments, and other DRC cities are marked "coming soon". Ask us: if we cannot deliver to you yet, we tell you right away.' } },
  { q: { fr: 'Quels objets sont interdits ?', en: 'Which items are prohibited?' }, a: { fr: 'Argent liquide et objets de valeur non déclarés, armes, produits inflammables ou corrosifs, substances illégales, denrées périssables non conditionnées, contrefaçons et animaux vivants. En cas de doute sur un objet, demandez-nous avant d’acheter.', en: 'Cash and undeclared valuables, weapons, flammable or corrosive products, illegal substances, unpackaged perishables, counterfeits and live animals. If in doubt about an item, ask us before buying.' } },
  { q: { fr: 'Comment je suis mon envoi ?', en: 'How do I track my shipment?' }, a: { fr: 'Dès la prise en charge, votre numéro de suivi Luna est actif. Vous entrez ce numéro sur la page Suivi et vous voyez l’étape en cours, de la récupération jusqu’à la livraison finale.', en: 'From pickup, your Luna tracking number is active. You enter it on the Tracking page and see the current step, from collection to final delivery.' } },
];

export type ReCase = {
  id: string; dir: 'vers' | 'depuis'; fromCode: string; toCode: string;
  mode: string; title: string; situation: string; actions: string[];
  tracking: string; note: string; heroTitle: string; heroText: string;
};

export function reexpData(lang: Lang) {
  return {
    origins: ORIGINS.map((o) => ({ code: o.code, label: pick(o.label, lang) })),
    destinations: DESTINATIONS.map((d) => ({ code: d.code, label: pick(d.label, lang) })),
    routeMap: ROUTE_MAP,
    cases: CASES.map((c): ReCase => ({
      id: c.id, dir: c.dir, fromCode: c.fromCode, toCode: c.toCode,
      mode: pick(c.mode, lang), title: pick(c.title, lang), situation: pick(c.situation, lang),
      actions: c.actions.map((a) => pick(a, lang)), tracking: pick(c.tracking, lang),
      note: pick(c.note, lang), heroTitle: pick(c.heroTitle, lang), heroText: pick(c.heroText, lang),
    })),
    steps: STEPS.map((s) => ({ n: s.n, title: pick(s.title, lang), body: pick(s.body, lang) })),
    compare: COMPARE.map((r) => ({ label: pick(r.label, lang), air: pick(r.air, lang), sea: pick(r.sea, lang) })),
    glossary: GLOSSARY.map((g) => ({ term: pick(g.term, lang), def: pick(g.def, lang) })),
    refused: REFUSED.map((x) => pick(x, lang)),
    mock: MOCK.map((m) => ({ active: m.active, label: pick(m.label, lang), meta: pick(m.meta, lang) })),
    chips: CHIPS.map((c) => pick(c, lang)),
    quantities: QUANTITIES.map((q) => pick(q, lang)),
    faqs: FAQS.map((f) => ({ q: pick(f.q, lang), a: pick(f.a, lang) })),
  };
}
