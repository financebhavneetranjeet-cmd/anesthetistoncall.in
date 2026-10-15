"use client";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useEffect, useMemo, useRef, useState } from "react";

type Point={id:string;name:string;latitude:number;longitude:number};
type Hospital={name:string;latitude:number;longitude:number};
type Maps={Map:new(element:HTMLElement,options:object)=>{fitBounds(bounds:unknown):void;panTo(point:{lat:number;lng:number}):void;setZoom(zoom:number):void};Marker:new(options:object)=>unknown;LatLngBounds:new()=>{extend(point:{lat:number;lng:number}):void}};

export function CaseResponderMap({hospital,responders,selectedId,onRefresh}:{hospital:Hospital;responders:Point[];selectedId:string|null;onRefresh:()=>Promise<void>}){
  const element=useRef<HTMLDivElement|null>(null),mapRef=useRef<InstanceType<Maps["Map"]>|null>(null),[error,setError]=useState("");
  const [refreshing,setRefreshing]=useState(false),[refreshVersion,setRefreshVersion]=useState(0);
  const snapshot=JSON.stringify({hospital,responders});
  const stable=useMemo(()=>JSON.parse(snapshot) as {hospital:Hospital;responders:Point[]},[snapshot]);
  async function refreshMap(){if(refreshing)return;setRefreshing(true);try{await onRefresh();setRefreshVersion(value=>value+1)}catch{setError("Unable to refresh map. Please try again.")}finally{setRefreshing(false)}}
  useEffect(()=>{const {hospital,responders}=stable;let active=true;(async()=>{try{const response=await fetch("/api/places/config"),payload=await response.json() as{apiKey?:string;error?:{message?:string}};if(!response.ok||!payload.apiKey)throw new Error(payload.error?.message??"Map is unavailable.");const maps=await loadGoogleMaps<Maps>(payload.apiKey);if(!active||!element.current)return;setError("");const bounds=new maps.LatLngBounds(),hospitalPoint={lat:hospital.latitude,lng:hospital.longitude};const map=new maps.Map(element.current,{center:hospitalPoint,zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});mapRef.current=map;new maps.Marker({map,position:hospitalPoint,title:hospital.name,label:"H"});bounds.extend(hospitalPoint);for(const responder of responders){const point={lat:responder.latitude,lng:responder.longitude};new maps.Marker({map,position:point,title:responder.name,label:"A"});bounds.extend(point)}map.fitBounds(bounds)}catch(c){if(active)setError((c as Error).message)}})();return()=>{active=false}},[stable,refreshVersion]);
  useEffect(()=>{const selected=stable.responders.find(item=>item.id===selectedId);if(selected&&mapRef.current){mapRef.current.panTo({lat:selected.latitude,lng:selected.longitude});mapRef.current.setZoom(15)}},[stable,selectedId,refreshVersion]);
  return <div className="overflow-hidden rounded-2xl border bg-slate-100"><div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3"><span className="text-sm font-semibold text-slate-800">Responder locations</span><button type="button" disabled={refreshing} onClick={()=>void refreshMap()} className="min-h-11 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">{refreshing?"Refreshing…":"Refresh map"}</button></div><div ref={element} className="h-64 w-full sm:h-80" aria-label="Hospital and responding anaesthetists map"/>{error&&<p role="alert" className="border-t bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="border-t bg-white px-4 py-3 text-xs text-slate-500">H = Hospital · A = Anaesthetist. Locations are visible only to the hospital that posted this case.</p></div>;
}
