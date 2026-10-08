import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checksumFile } from "@/features/files/file-checksum";
import { expectedPartSize, multipartPartSize, multipartCreateSchema, multipartOperationSchema, validateMultipartParts } from "@/features/files/multipart-upload";
const part=(partNumber:number,size= multipartPartSize)=>({partNumber,size,etag:'"'+'a'.repeat(32)+'"'});
describe("multipart identity and bounds",()=>{
  it("hashes exact bytes incrementally without whole-file buffering",async()=>{
    const bytes=Buffer.alloc(3*1024*1024+7,11);const file=new Blob([bytes]);
    file.arrayBuffer=()=>{throw new Error("whole file read");};
    expect(await checksumFile(file)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
  it("stops checksum work on pause",async()=>{
    const controller=new AbortController();controller.abort();await expect(checksumFile(new Blob(["abc"]),controller.signal)).rejects.toThrow();
  });
  it("uses uniform 8 MiB nonterminal parts and max 100 MiB",()=>{
    expect(expectedPartSize(100*1024*1024,13)).toBe(4*1024*1024);
    expect(()=>expectedPartSize(101*1024*1024,1)).toThrow();
    expect(()=>expectedPartSize(multipartPartSize,2)).toThrow();
    expect(validateMultipartParts([part(2,2),part(1)],multipartPartSize+2,true).map(p=>p.partNumber)).toEqual([1,2]);
  });
  it("rejects duplicate, wrong-size, out-of-range, missing and invented ETags",()=>{
    for(const parts of [[part(1),part(1)],[part(1,5)],[part(3)], [{...part(1),etag:'untrusted'}]])expect(()=>validateMultipartParts(parts,multipartPartSize+2)).toThrow();
    expect(()=>validateMultipartParts([part(1)],multipartPartSize+2,true)).toThrow("incomplete_multipart_parts");
    expect(validateMultipartParts([part(2,2)],multipartPartSize+2)).toHaveLength(1);
  });
  it("never accepts provider IDs, parts, owner IDs, paths or unsigned checksum",()=>{
    const base={filename:"a.pdf",contentType:"application/pdf",size:10,checksum:"a".repeat(64)};
    expect(multipartCreateSchema.safeParse(base).success).toBe(true);
    for(const extra of [{userId:"owner"},{uploadId:"provider"},{storagePath:"key"},{parts:[]}])expect(multipartCreateSchema.safeParse({...base,...extra}).success).toBe(false);
    expect(multipartCreateSchema.safeParse({...base,checksum:undefined}).success).toBe(false);
    expect(multipartOperationSchema.safeParse({action:"sign",sessionId:crypto.randomUUID(),partNumber:14}).success).toBe(false);
  });
});
