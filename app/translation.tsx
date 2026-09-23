export type TranslatedText={translation_en?:string|null;translation_ko?:string|null};
export default function Translation({item}: {item:TranslatedText}){
 if(!item.translation_en||!item.translation_ko)return null;
 return <div className="workshop-translation" aria-label="Automatic translation"><div lang="en">{item.translation_en}</div><div lang="ko">{item.translation_ko}</div></div>;
}
