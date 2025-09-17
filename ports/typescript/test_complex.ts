import * as bstd from './std.ts';

// ComplexData class
class ComplexData {
  Id: number = 0;
  Title: string = "";
  Items: SubItem[] = [];
  Metadata: Map<string, number> = new Map();
  Sub_data: SubComplexData = new SubComplexData();
  Large_binary_data: Uint8Array[] = [];
  Huge_list: number[] = [];

  sizePlain(): number {
    let s = 0;
    s += bstd.sizeInt64();
    s += bstd.sizeString(this.Title);
    s += bstd.sizeSlice(this.Items, (item: SubItem) => item.sizePlain());
    s += bstd.sizeMap(this.Metadata, bstd.sizeString, bstd.sizeInt32);
    s += this.Sub_data.sizePlain();
    s += bstd.sizeSlice(this.Large_binary_data, bstd.sizeBytes);
    s += bstd.sizeSlice(this.Huge_list, bstd.sizeInt64);
    return s;
  }

  marshalPlain(n: number, b: Uint8Array): number {
    n = bstd.marshalInt64(n, b, this.Id);
    n = bstd.marshalString(n, b, this.Title);
    n = bstd.marshalSlice(n, b, this.Items, (n: number, b: Uint8Array, item: SubItem) => item.marshalPlain(n, b));
    n = bstd.marshalMap(n, b, this.Metadata, bstd.marshalString, bstd.marshalInt32);
    n = this.Sub_data.marshalPlain(n, b);
    n = bstd.marshalSlice(n, b, this.Large_binary_data, bstd.marshalBytes);
    n = bstd.marshalSlice(n, b, this.Huge_list, bstd.marshalInt64);
    return n;
  }

  unmarshalPlain(n: number, b: Uint8Array): number {
    [n, this.Id] = bstd.unmarshalInt64(n, b);
    [n, this.Title] = bstd.unmarshalString(n, b);
    
    [n, this.Items] = bstd.unmarshalSlice(n, b, (n: number, b: Uint8Array) => {
      const item = new SubItem();
      n = item.unmarshalPlain(n, b);
      return [n, item];
    });
    
    [n, this.Metadata] = bstd.unmarshalMap(n, b, bstd.unmarshalString, bstd.unmarshalInt32);
    n = this.Sub_data.unmarshalPlain(n, b);
    
    [n, this.Large_binary_data] = bstd.unmarshalSlice(n, b, bstd.unmarshalBytesCropped);
    [n, this.Huge_list] = bstd.unmarshalSlice(n, b, bstd.unmarshalInt64);
    
    return n;
  }
}

// SubItem class
class SubItem {
  Sub_id: number = 0;
  Description: string = "";
  Sub_items: SubSubItem[] = [];

  sizePlain(): number {
    let s = 0;
    s += bstd.sizeInt32();
    s += bstd.sizeString(this.Description);
    s += bstd.sizeSlice(this.Sub_items, (item: SubSubItem) => item.sizePlain());
    return s;
  }

  marshalPlain(n: number, b: Uint8Array): number {
    n = bstd.marshalInt32(n, b, this.Sub_id);
    n = bstd.marshalString(n, b, this.Description);
    n = bstd.marshalSlice(n, b, this.Sub_items, (n: number, b: Uint8Array, item: SubSubItem) => item.marshalPlain(n, b));
    return n;
  }

  unmarshalPlain(n: number, b: Uint8Array): number {
    [n, this.Sub_id] = bstd.unmarshalInt32(n, b);
    [n, this.Description] = bstd.unmarshalString(n, b);
    
    [n, this.Sub_items] = bstd.unmarshalSlice(n, b, (n: number, b: Uint8Array) => {
      const item = new SubSubItem();
      n = item.unmarshalPlain(n, b);
      return [n, item];
    });
    
    return n;
  }
}

// SubSubItem class
class SubSubItem {
  Sub_sub_id: string = "";
  Sub_sub_data: Uint8Array = new Uint8Array();

  sizePlain(): number {
    let s = 0;
    s += bstd.sizeString(this.Sub_sub_id);
    s += bstd.sizeBytes(this.Sub_sub_data);
    return s;
  }

  marshalPlain(n: number, b: Uint8Array): number {
    n = bstd.marshalString(n, b, this.Sub_sub_id);
    n = bstd.marshalBytes(n, b, this.Sub_sub_data);
    return n;
  }

  unmarshalPlain(n: number, b: Uint8Array): number {
    [n, this.Sub_sub_id] = bstd.unmarshalString(n, b);
    [n, this.Sub_sub_data] = bstd.unmarshalBytesCropped(n, b);
    return n;
  }
}

// SubComplexData class
class SubComplexData {
  Sub_id: number = 0;
  Sub_title: string = "";
  Sub_binary_data: Uint8Array[] = [];
  Sub_items: SubItem[] = [];
  Sub_metadata: Map<string, string> = new Map();

  sizePlain(): number {
    let s = 0;
    s += bstd.sizeInt32();
    s += bstd.sizeString(this.Sub_title);
    s += bstd.sizeSlice(this.Sub_binary_data, bstd.sizeBytes);
    s += bstd.sizeSlice(this.Sub_items, (item: SubItem) => item.sizePlain());
    s += bstd.sizeMap(this.Sub_metadata, bstd.sizeString, bstd.sizeString);
    return s;
  }

  marshalPlain(n: number, b: Uint8Array): number {
    n = bstd.marshalInt32(n, b, this.Sub_id);
    n = bstd.marshalString(n, b, this.Sub_title);
    n = bstd.marshalSlice(n, b, this.Sub_binary_data, bstd.marshalBytes);
    n = bstd.marshalSlice(n, b, this.Sub_items, (n: number, b: Uint8Array, item: SubItem) => item.marshalPlain(n, b));
    n = bstd.marshalMap(n, b, this.Sub_metadata, bstd.marshalString, bstd.marshalString);
    return n;
  }

  unmarshalPlain(n: number, b: Uint8Array): number {
    [n, this.Sub_id] = bstd.unmarshalInt32(n, b);
    [n, this.Sub_title] = bstd.unmarshalString(n, b);
    
    [n, this.Sub_binary_data] = bstd.unmarshalSlice(n, b, bstd.unmarshalBytesCropped);
    
    [n, this.Sub_items] = bstd.unmarshalSlice(n, b, (n: number, b: Uint8Array) => {
      const item = new SubItem();
      n = item.unmarshalPlain(n, b);
      return [n, item];
    });
    
    [n, this.Sub_metadata] = bstd.unmarshalMap(n, b, bstd.unmarshalString, bstd.unmarshalString);
    
    return n;
  }
}

// Test function
function testComplex(): void {
  const data = new ComplexData();
  data.Id = 12345;
  data.Title = "Example Complex Data";
  
  const subItem1 = new SubItem();
  subItem1.Sub_id = 1;
  subItem1.Description = "SubItem 1";
  
  const subSubItem1 = new SubSubItem();
  subSubItem1.Sub_sub_id = "subsub1";
  subSubItem1.Sub_sub_data = new Uint8Array([0x01, 0x02, 0x03]);
  
  subItem1.Sub_items = [subSubItem1];
  data.Items = [subItem1];
  
  data.Metadata = new Map([
    ["key1", 10],
    ["key2", 20]
  ]);
  
  const subComplexData = new SubComplexData();
  subComplexData.Sub_id = 999;
  subComplexData.Sub_title = "Sub Complex Data";
  subComplexData.Sub_binary_data = [
    new Uint8Array([0x11, 0x22, 0x33]),
    new Uint8Array([0x44, 0x55, 0x66])
  ];
  
  const subItem2 = new SubItem();
  subItem2.Sub_id = 2;
  subItem2.Description = "SubItem 2";
  
  const subSubItem2 = new SubSubItem();
  subSubItem2.Sub_sub_id = "subsub2";
  subSubItem2.Sub_sub_data = new Uint8Array([0xAA, 0xBB, 0xCC]);
  
  subItem2.Sub_items = [subSubItem2];
  subComplexData.Sub_items = [subItem2];
  
  subComplexData.Sub_metadata = new Map([
    ["meta1", "value1"],
    ["meta2", "value2"]
  ]);
  
  data.Sub_data = subComplexData;
  
  data.Large_binary_data = [
    new Uint8Array([0xFF, 0xEE, 0xDD])
  ];
  
  data.Huge_list = [1000000, 2000000, 3000000];

  const s = data.sizePlain();
  const b = new Uint8Array(s);
  data.marshalPlain(0, b);

  const retData = new ComplexData();
  retData.unmarshalPlain(0, b);

  // Compare the objects
  if (JSON.stringify(data) !== JSON.stringify(retData)) {
    throw new Error("no match");
  }

  console.log("Complex test passed!");
}

// Run the test
try {
  testComplex();
  console.log("All tests passed!");
} catch (err) {
  console.error("Test failed:", err.message);
}