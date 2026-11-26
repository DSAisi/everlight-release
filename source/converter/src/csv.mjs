// Strict streaming CSV: quoted multiline fields, escaped quotes, CRLF and BOM.
export async function* readCsv(stream){
 let headers=null,row=[],field='',state='start',skipLF=false,first=true;
 function finish(){row.push(field);field='';state='start';const cells=row;row=[];if(!headers){headers=cells;if(headers.some(x=>!x.trim())||new Set(headers).size!==headers.length)throw Error('Invalid CSV headers');return null;}if(cells.length!==headers.length)throw Error('CSV column count mismatch');return Object.fromEntries(headers.map((h,i)=>[h,cells[i]]));}
 for await(const chunk of stream.setEncoding('utf8'))for(const c of chunk){
 if(first){first=false;if(c==='\uFEFF')continue;}
 if(skipLF){skipLF=false;if(c==='\n')continue;}
 if(state==='quoted'){if(c==='"')state='closed';else field+=c;continue;}
 if(state==='closed'&&c==='"'){field+='"';state='quoted';continue;}
 if(c===',' ){row.push(field);field='';state='start';continue;}
 if(c==='\r'||c==='\n'){const result=finish();if(c==='\r')skipLF=true;if(result)yield result;continue;}
 if(state==='closed')throw Error('Unexpected character after CSV quote');
 if(c==='"'){if(state!=='start')throw Error('Unexpected CSV quote');state='quoted';continue;}
 field+=c;state='plain';
 }
 if(state==='quoted')throw Error('Unterminated CSV quote');
 if(row.length||state!=='start'){const result=finish();if(result)yield result;}
 if(!headers)throw Error('Missing CSV headers');
}
