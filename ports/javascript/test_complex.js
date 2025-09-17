import { sizeInt64, sizeString, sizeSlice, sizeMap, sizeInt32, sizeBytes, marshalInt64, marshalString, marshalSlice, marshalMap, marshalInt32, marshalBytes, unmarshalInt64, unmarshalString, unmarshalSlice, unmarshalMap, unmarshalInt32, unmarshalBytesCropped } from './std.js';

// ComplexData class
class ComplexData {
    constructor() {
        this.Id = 0;
        this.Title = "";
        this.Items = [];
        this.Metadata = new Map();
        this.Sub_data = new SubComplexData();
        this.Large_binary_data = [];
        this.Huge_list = [];
    }
    sizePlain() {
        let s = 0;
        s += sizeInt64();
        s += sizeString(this.Title);
        s += sizeSlice(this.Items, function (item) { return item.sizePlain(); });
        s += sizeMap(this.Metadata, sizeString, sizeInt32);
        s += this.Sub_data.sizePlain();
        s += sizeSlice(this.Large_binary_data, sizeBytes);
        s += sizeSlice(this.Huge_list, sizeInt64);
        return s;
    }
    marshalPlain(n, b) {
        n = marshalInt64(n, b, this.Id);
        n = marshalString(n, b, this.Title);
        n = marshalSlice(n, b, this.Items, function (n, b, item) { return item.marshalPlain(n, b); });
        n = marshalMap(n, b, this.Metadata, marshalString, marshalInt32);
        n = this.Sub_data.marshalPlain(n, b);
        n = marshalSlice(n, b, this.Large_binary_data, marshalBytes);
        n = marshalSlice(n, b, this.Huge_list, marshalInt64);
        return n;
    }
    unmarshalPlain(n, b) {
        var result;
        result = unmarshalInt64(n, b);
        n = result[0];
        this.Id = result[1];

        result = unmarshalString(n, b);
        n = result[0];
        this.Title = result[1];

        result = unmarshalSlice(n, b, function (n, b) {
            var item = new SubItem();
            n = item.unmarshalPlain(n, b);
            return [n, item];
        });
        n = result[0];
        this.Items = result[1];

        result = unmarshalMap(n, b, unmarshalString, unmarshalInt32);
        n = result[0];
        this.Metadata = result[1];

        n = this.Sub_data.unmarshalPlain(n, b);

        result = unmarshalSlice(n, b, unmarshalBytesCropped);
        n = result[0];
        this.Large_binary_data = result[1];

        result = unmarshalSlice(n, b, unmarshalInt64);
        n = result[0];
        this.Huge_list = result[1];

        return n;
    }
}




// SubItem class
function SubItem() {
  this.Sub_id = 0;
  this.Description = "";
  this.Sub_items = [];
}

SubItem.prototype.sizePlain = function() {
  let s = 0;
  s += sizeInt32();
  s += sizeString(this.Description);
  s += sizeSlice(this.Sub_items, function(item) { return item.sizePlain(); });
  return s;
};

SubItem.prototype.marshalPlain = function(n, b) {
  n = marshalInt32(n, b, this.Sub_id);
  n = marshalString(n, b, this.Description);
  n = marshalSlice(n, b, this.Sub_items, function(n, b, item) { return item.marshalPlain(n, b); });
  return n;
};

SubItem.prototype.unmarshalPlain = function(n, b) {
  var result;
  result = unmarshalInt32(n, b);
  n = result[0];
  this.Sub_id = result[1];
  
  result = unmarshalString(n, b);
  n = result[0];
  this.Description = result[1];
  
  result = unmarshalSlice(n, b, function(n, b) {
    var item = new SubSubItem();
    n = item.unmarshalPlain(n, b);
    return [n, item];
  });
  n = result[0];
  this.Sub_items = result[1];
  
  return n;
};

// SubSubItem class
class SubSubItem {
    constructor() {
        this.Sub_sub_id = "";
        this.Sub_sub_data = new Uint8Array();
    }
    sizePlain() {
        let s = 0;
        s += sizeString(this.Sub_sub_id);
        s += sizeBytes(this.Sub_sub_data);
        return s;
    }
    marshalPlain(n, b) {
        n = marshalString(n, b, this.Sub_sub_id);
        n = marshalBytes(n, b, this.Sub_sub_data);
        return n;
    }
    unmarshalPlain(n, b) {
        var result;
        result = unmarshalString(n, b);
        n = result[0];
        this.Sub_sub_id = result[1];

        result = unmarshalBytesCropped(n, b);
        n = result[0];
        this.Sub_sub_data = result[1];

        return n;
    }
}




// SubComplexData class
class SubComplexData {
    constructor() {
        this.Sub_id = 0;
        this.Sub_title = "";
        this.Sub_binary_data = [];
        this.Sub_items = [];
        this.Sub_metadata = new Map();
    }
    sizePlain() {
        let s = 0;
        s += sizeInt32();
        s += sizeString(this.Sub_title);
        s += sizeSlice(this.Sub_binary_data, sizeBytes);
        s += sizeSlice(this.Sub_items, function (item) { return item.sizePlain(); });
        s += sizeMap(this.Sub_metadata, sizeString, sizeString);
        return s;
    }
    marshalPlain(n, b) {
        n = marshalInt32(n, b, this.Sub_id);
        n = marshalString(n, b, this.Sub_title);
        n = marshalSlice(n, b, this.Sub_binary_data, marshalBytes);
        n = marshalSlice(n, b, this.Sub_items, function (n, b, item) { return item.marshalPlain(n, b); });
        n = marshalMap(n, b, this.Sub_metadata, marshalString, marshalString);
        return n;
    }
    unmarshalPlain(n, b) {
        var result;
        result = unmarshalInt32(n, b);
        n = result[0];
        this.Sub_id = result[1];

        result = unmarshalString(n, b);
        n = result[0];
        this.Sub_title = result[1];

        result = unmarshalSlice(n, b, unmarshalBytesCropped);
        n = result[0];
        this.Sub_binary_data = result[1];

        result = unmarshalSlice(n, b, function (n, b) {
            var item = new SubItem();
            n = item.unmarshalPlain(n, b);
            return [n, item];
        });
        n = result[0];
        this.Sub_items = result[1];

        result = unmarshalMap(n, b, unmarshalString, unmarshalString);
        n = result[0];
        this.Sub_metadata = result[1];

        return n;
    }
}




// Test function
function testComplex() {
  var data = new ComplexData();
  data.Id = 12345;
  data.Title = "Example Complex Data";
  
  var subItem1 = new SubItem();
  subItem1.Sub_id = 1;
  subItem1.Description = "SubItem 1";
  
  var subSubItem1 = new SubSubItem();
  subSubItem1.Sub_sub_id = "subsub1";
  subSubItem1.Sub_sub_data = new Uint8Array([0x01, 0x02, 0x03]);
  
  subItem1.Sub_items = [subSubItem1];
  data.Items = [subItem1];
  
  data.Metadata = new Map([
    ["key1", 10],
    ["key2", 20]
  ]);
  
  var subComplexData = new SubComplexData();
  subComplexData.Sub_id = 999;
  subComplexData.Sub_title = "Sub Complex Data";
  subComplexData.Sub_binary_data = [
    new Uint8Array([0x11, 0x22, 0x33]),
    new Uint8Array([0x44, 0x55, 0x66])
  ];
  
  var subItem2 = new SubItem();
  subItem2.Sub_id = 2;
  subItem2.Description = "SubItem 2";
  
  var subSubItem2 = new SubSubItem();
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

  var s = data.sizePlain();
  var b = new Uint8Array(s);
  data.marshalPlain(0, b);

  var retData = new ComplexData();
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
  process.exit(1);
}