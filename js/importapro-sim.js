function simCalc(){
  const costo=parseFloat(document.getElementById('sim-costo').value)||0;
  const margenT=parseFloat(document.getElementById('sim-margen').value)||30;
  const iva=parseFloat(document.getElementById('sim-iva').value)||21;
  const iibb=parseFloat(document.getElementById('sim-iibb').value)||3;
  const iigg=parseFloat(document.getElementById('sim-iigg').value)||35;
  const channels=[{nombre:'Mercado Libre',comision:13},{nombre:'Tienda propia',comision:3},{nombre:'Instagram / WA',comision:0},{nombre:'Otro marketplace',comision:8}];
  document.getElementById('sim-result').innerHTML=channels.map(ch=>{
    const ivaF=1+iva/100;const comF=ch.comision/100;const iibbF=iibb/100;
    const base=costo*(1+margenT/100/(1-iigg/100))/(1-comF-iibbF);
    const precio=Math.round(base*ivaF);
    const ganB=precio-costo-precio*comF-precio*iibbF-precio/ivaF*(iva/100);
    const ganPost=ganB*(1-iigg/100);
    const mgReal=costo>0?Math.round(ganPost/costo*100):0;
    const badge=mgReal>=30?'green':mgReal>=10?'amber':'red';
    return `<div class="sim-ch-row">
      <span style="color:var(--text-2);font-weight:500">${ch.nombre}</span>
      <div style="text-align:right">
        <div class="sim-price">${ars(precio)}</div>
        <div style="font-size:11.5px;margin-top:3px;display:flex;gap:8px;justify-content:flex-end;align-items:center">
          <span class="badge badge-${badge}">${mgReal}% post-IIGG</span>
          <span style="color:var(--text-3)">gan. ${ars(ganPost)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  const varPct=[-30,-20,-10,0,10,20,30,50,80,100];
  document.getElementById('sensibilidad-table').innerHTML=
    `<div class="sens-row"><span>Variación del precio</span><span>Precio c/ IVA</span><span>Margen bruto (ML 13%)</span></div>`+
    varPct.map(vp=>{
      const pr=Math.round(costo*(1+vp/100)*(1+iva/100));
      const gan=pr-costo-pr*0.13-pr*iibb/100-pr/(1+iva/100)*(iva/100);
      const mg=costo>0?Math.round(gan/costo*100):0;
      const b=mg>=50?'green':mg>=20?'amber':'red';
      return `<div class="sens-row"><span style="color:var(--text-2)">${vp>=0?'+':''}${vp}% sobre costo</span><span style="font-weight:500">${ars(pr)}</span><span><span class="badge badge-${b}">${mg}%</span></span></div>`;
    }).join('');
}

function exportarCSV(){
  const c=calcCostos();const nombre=v('p-nombre')||'Producto';
  const rows=[
    ['Campo','USD','ARS'],['Nombre',nombre,''],['FOB unitario',c.fob,''],['Cantidad',c.qty,''],
    ['Flete unitario',rd(c.fleteUnit,2),''],['Seguro unitario',rd(c.seguroUnit,3),''],
    ['CIF unitario',rd(c.cif,2),''],
    [`Comisión trader (${c.traderPct}%)`,rd(c.traderUnit,2),Math.round(c.traderUnit*c.tc)],
    ['D.I.',rd(c.diUnit,2),Math.round(c.diUnit*c.tc)],
    ['IVA importación',rd(c.ivaUnit,2),Math.round(c.ivaUnit*c.tc)],
    ['Tasa estadística',rd(c.teUnit,2),Math.round(c.teUnit*c.tc)],
    ['Aduana + transporte',rd(c.aduanaUnit,2),Math.round(c.aduanaUnit*c.tc)],
    ['COSTO UNITARIO',rd(c.costoUSD,2),Math.round(c.costoARS)],[],
    ['Canal','Precio ARS','Comisión %','Ganancia/u ARS','Margen %'],
    ...canales.map(ch=>{const gan=ch.precio-ch.precio*ch.comision/100-c.costoARS;return[ch.nombre,ch.precio,ch.comision,Math.round(gan),c.costoARS>0?Math.round(gan/c.costoARS*100):0];})
  ];
  const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:`importa-${nombre.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`}).click();
  URL.revokeObjectURL(url);toast('CSV exportado');
}
