// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/is-message.js
function isMessage(arg, schema) {
  const isMessage2 = arg !== null && typeof arg == "object" && "$typeName" in arg && typeof arg.$typeName == "string";
  if (!isMessage2) {
    return false;
  }
  if (schema === void 0) {
    return true;
  }
  return schema.typeName === arg.$typeName;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/descriptors.js
var ScalarType;
(function(ScalarType2) {
  ScalarType2[ScalarType2["DOUBLE"] = 1] = "DOUBLE";
  ScalarType2[ScalarType2["FLOAT"] = 2] = "FLOAT";
  ScalarType2[ScalarType2["INT64"] = 3] = "INT64";
  ScalarType2[ScalarType2["UINT64"] = 4] = "UINT64";
  ScalarType2[ScalarType2["INT32"] = 5] = "INT32";
  ScalarType2[ScalarType2["FIXED64"] = 6] = "FIXED64";
  ScalarType2[ScalarType2["FIXED32"] = 7] = "FIXED32";
  ScalarType2[ScalarType2["BOOL"] = 8] = "BOOL";
  ScalarType2[ScalarType2["STRING"] = 9] = "STRING";
  ScalarType2[ScalarType2["BYTES"] = 12] = "BYTES";
  ScalarType2[ScalarType2["UINT32"] = 13] = "UINT32";
  ScalarType2[ScalarType2["SFIXED32"] = 15] = "SFIXED32";
  ScalarType2[ScalarType2["SFIXED64"] = 16] = "SFIXED64";
  ScalarType2[ScalarType2["SINT32"] = 17] = "SINT32";
  ScalarType2[ScalarType2["SINT64"] = 18] = "SINT64";
})(ScalarType || (ScalarType = {}));

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
function varint64read() {
  const buf = this.buf;
  let pos = this.pos;
  let lo = 0;
  let hi = 0;
  for (let shift = 0; shift < 28; shift += 7) {
    const b = buf[pos++];
    lo |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.pos = pos;
      this.assertBounds();
      this.varint64Lo = lo;
      this.varint64Hi = hi;
      return;
    }
  }
  const middleByte = buf[pos++];
  lo |= (middleByte & 15) << 28;
  hi = (middleByte & 112) >> 4;
  if ((middleByte & 128) == 0) {
    this.pos = pos;
    this.assertBounds();
    this.varint64Lo = lo;
    this.varint64Hi = hi;
    return;
  }
  for (let shift = 3; shift <= 31; shift += 7) {
    const b = buf[pos++];
    hi |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.pos = pos;
      this.assertBounds();
      this.varint64Lo = lo;
      this.varint64Hi = hi;
      return;
    }
  }
  throw new Error("invalid varint");
}
var TWO_PWR_32_DBL = 4294967296;
function int64FromString(dec) {
  const minus = dec[0] === "-";
  if (minus) {
    dec = dec.slice(1);
  }
  const base = 1e6;
  let lowBits = 0;
  let highBits = 0;
  function add1e6digit(begin, end) {
    const digit1e6 = Number(dec.slice(begin, end));
    highBits *= base;
    lowBits = lowBits * base + digit1e6;
    if (lowBits >= TWO_PWR_32_DBL) {
      highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
      lowBits = lowBits % TWO_PWR_32_DBL;
    }
  }
  add1e6digit(-24, -18);
  add1e6digit(-18, -12);
  add1e6digit(-12, -6);
  add1e6digit(-6);
  return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
}
function int64ToString(lo, hi) {
  let bits = newBits(lo, hi);
  const negative = bits.hi & 2147483648;
  if (negative) {
    bits = negate(bits.lo, bits.hi);
  }
  const result = uInt64ToString(bits.lo, bits.hi);
  return negative ? "-" + result : result;
}
function uInt64ToString(lo, hi) {
  ({ lo, hi } = toUnsigned(lo, hi));
  if (hi <= 2097151) {
    return String(TWO_PWR_32_DBL * hi + lo);
  }
  const low = lo & 16777215;
  const mid = (lo >>> 24 | hi << 8) & 16777215;
  const high = hi >> 16 & 65535;
  let digitA = low + mid * 6777216 + high * 6710656;
  let digitB = mid + high * 8147497;
  let digitC = high * 2;
  const base = 1e7;
  if (digitA >= base) {
    digitB += Math.floor(digitA / base);
    digitA %= base;
  }
  if (digitB >= base) {
    digitC += Math.floor(digitB / base);
    digitB %= base;
  }
  return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
}
function toUnsigned(lo, hi) {
  return { lo: lo >>> 0, hi: hi >>> 0 };
}
function newBits(lo, hi) {
  return { lo: lo | 0, hi: hi | 0 };
}
function negate(lowBits, highBits) {
  highBits = ~highBits;
  if (lowBits) {
    lowBits = ~lowBits + 1;
  } else {
    highBits += 1;
  }
  return newBits(lowBits, highBits);
}
var decimalFrom1e7WithLeadingZeros = (digit1e7) => {
  const partial = String(digit1e7);
  return "0000000".slice(partial.length) + partial;
};
function varint32write(value, bytes) {
  if (value >>> 0 < 128) {
    bytes.push(value);
    return;
  }
  if (value >= 0) {
    while (value > 127) {
      bytes.push(value & 127 | 128);
      value = value >>> 7;
    }
    bytes.push(value);
  } else {
    for (let i = 0; i < 9; i++) {
      bytes.push(value & 127 | 128);
      value = value >> 7;
    }
    bytes.push(1);
  }
}
function varint32read() {
  let b = this.buf[this.pos++];
  if ((b & 128) === 0) {
    this.assertBounds();
    return b;
  }
  let result = b & 127;
  b = this.buf[this.pos++];
  result |= (b & 127) << 7;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 14;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 21;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 15) << 28;
  for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++)
    b = this.buf[this.pos++];
  if ((b & 128) !== 0)
    throw new Error("invalid varint");
  this.assertBounds();
  return result >>> 0;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
var protoInt64 = /* @__PURE__ */ makeInt64Support();
function makeInt64Support() {
  const dv = new DataView(new ArrayBuffer(8));
  const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || !!globalThis.Bun || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
  if (ok) {
    const MIN = BigInt("-9223372036854775808");
    const MAX = BigInt("9223372036854775807");
    const UMIN = BigInt("0");
    const UMAX = BigInt("18446744073709551615");
    return {
      zero: BigInt(0),
      supported: true,
      parse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > MAX || bi < MIN) {
          throw new Error(`invalid int64: ${value}`);
        }
        return bi;
      },
      uParse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > UMAX || bi < UMIN) {
          throw new Error(`invalid uint64: ${value}`);
        }
        return bi;
      },
      enc(value) {
        dv.setBigInt64(0, this.parse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      uEnc(value) {
        dv.setBigInt64(0, this.uParse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      dec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigInt64(0, true);
      },
      uDec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigUint64(0, true);
      }
    };
  }
  return {
    zero: "0",
    supported: false,
    parse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return value;
    },
    uParse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return value;
    },
    enc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return int64FromString(value);
    },
    uEnc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return int64FromString(value);
    },
    dec(lo, hi) {
      return int64ToString(lo, hi);
    },
    uDec(lo, hi) {
      return uInt64ToString(lo, hi);
    }
  };
}
function assertInt64String(value) {
  if (!/^-?[0-9]+$/.test(value)) {
    throw new Error("invalid int64: " + value);
  }
}
function assertUInt64String(value) {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("invalid uint64: " + value);
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/scalar.js
function scalarZeroValue(type, longAsString) {
  switch (type) {
    case ScalarType.STRING:
      return "";
    case ScalarType.BOOL:
      return false;
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return 0;
    case ScalarType.INT64:
    case ScalarType.UINT64:
    case ScalarType.SFIXED64:
    case ScalarType.FIXED64:
    case ScalarType.SINT64:
      return longAsString ? "0" : protoInt64.zero;
    case ScalarType.BYTES:
      return new Uint8Array(0);
    default:
      return 0;
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/unsafe.js
function unsafeIsSetExplicit(target, localName) {
  return Object.prototype.hasOwnProperty.call(target, localName) && target[localName] !== void 0;
}
function setOwn(obj, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(obj, "__proto__", {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    obj[key] = value;
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/guard.js
function isObject(arg) {
  return arg !== null && typeof arg == "object" && !Array.isArray(arg);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wkt/wrappers.js
function isWrapperDesc(messageDesc2) {
  const f = messageDesc2.fields[0];
  return isWrapperTypeName(messageDesc2.typeName) && f !== void 0 && f.fieldKind == "scalar" && f.name == "value" && f.number == 1;
}
var wrapperTypeNames = /* @__PURE__ */ new Set([
  "google.protobuf.DoubleValue",
  "google.protobuf.FloatValue",
  "google.protobuf.Int64Value",
  "google.protobuf.UInt64Value",
  "google.protobuf.Int32Value",
  "google.protobuf.UInt32Value",
  "google.protobuf.BoolValue",
  "google.protobuf.StringValue",
  "google.protobuf.BytesValue"
]);
function isWrapperTypeName(name) {
  return wrapperTypeNames.has(name);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/create.js
var EDITION_PROTO3 = 999;
var EDITION_PROTO2 = 998;
var IMPLICIT = 2;
function create(schema, init) {
  if (isMessage(init, schema)) {
    return init;
  }
  return compiledCreate(schema)(init);
}
var compiledCreates = /* @__PURE__ */ new WeakMap();
function compiledCreate(desc) {
  let compiled = compiledCreates.get(desc);
  if (compiled === void 0) {
    compiled = compileCreate(desc);
    compiledCreates.set(desc, compiled);
  }
  return compiled;
}
var INIT_SINGULAR = 0;
var INIT_LIST = 1;
var INIT_MAP = 2;
var INIT_ONEOF = 3;
function compileCreate(desc) {
  const typeName = desc.typeName;
  const { properties, prototype } = compileInitMessage(desc);
  return (init) => {
    let message;
    if (prototype !== void 0) {
      message = Object.create(prototype);
      message.$typeName = typeName;
    } else {
      message = { $typeName: typeName };
    }
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const name = property.name;
      const initValue = init === null || init === void 0 ? void 0 : init[name];
      switch (property.kind) {
        case INIT_SINGULAR:
          if (initValue != null) {
            message[name] = property.convert !== void 0 ? property.convert(initValue) : initValue;
          } else if (property.constant !== void 0) {
            message[name] = property.constant;
          }
          break;
        case INIT_LIST:
          message[name] = property.convert !== void 0 && Array.isArray(initValue) ? initValue.map(property.convert) : initValue !== null && initValue !== void 0 ? initValue : [];
          break;
        case INIT_MAP:
          if (property.convert === void 0 || !isObject(initValue)) {
            message[name] = initValue !== null && initValue !== void 0 ? initValue : {};
          } else {
            const converted = {};
            const keys = Object.keys(initValue);
            for (let k = 0; k < keys.length; k++) {
              setOwn(converted, keys[k], property.convert(initValue[keys[k]]));
            }
            message[name] = converted;
          }
          break;
        case INIT_ONEOF: {
          const oneofValue = initValue;
          if ((oneofValue === null || oneofValue === void 0 ? void 0 : oneofValue.case) != null) {
            const convert = property.convert.get(oneofValue.case);
            if (convert !== void 0) {
              message[name] = {
                case: oneofValue.case,
                value: convert(oneofValue.value)
              };
              break;
            }
          }
          message[name] = { case: void 0 };
          break;
        }
      }
    }
    return message;
  };
}
function compileInitMessage(desc) {
  var _a, _b;
  const properties = [];
  const prototype = {};
  const usePrototype = needsPrototypeChain(desc);
  for (const member of desc.members) {
    const name = member.localName;
    if (member.kind == "oneof") {
      properties.push({
        name,
        kind: INIT_ONEOF,
        constant: void 0,
        convert: compileConvertOneof(member)
      });
      continue;
    }
    switch (member.fieldKind) {
      case "message": {
        properties.push({
          name,
          kind: INIT_SINGULAR,
          constant: void 0,
          convert: compileConvertMessage(member)
        });
        break;
      }
      case "list": {
        properties.push({
          name,
          kind: INIT_LIST,
          constant: void 0,
          convert: member.listKind == "message" ? (_a = compileConvertMessage(member)) !== null && _a !== void 0 ? _a : ((value) => value) : member.scalar == ScalarType.BYTES ? toU8Arr : void 0
        });
        break;
      }
      case "map": {
        properties.push({
          name,
          kind: INIT_MAP,
          constant: void 0,
          convert: member.mapKind == "message" ? (_b = compileConvertMessage(member)) !== null && _b !== void 0 ? _b : ((value) => value) : member.scalar == ScalarType.BYTES ? toU8Arr : void 0
        });
        break;
      }
      default: {
        const zeroValue = createZeroValue(member);
        properties.push({
          name,
          kind: INIT_SINGULAR,
          constant: member.presence == IMPLICIT ? zeroValue : void 0,
          convert: member.fieldKind == "scalar" && member.scalar == ScalarType.BYTES ? toU8Arr : void 0
        });
        if (usePrototype) {
          prototype[name] = zeroValue;
        }
        break;
      }
    }
  }
  return {
    properties,
    prototype: usePrototype ? prototype : void 0
  };
}
function compileConvertOneof(oneof) {
  const converters = /* @__PURE__ */ new Map();
  for (const field of oneof.fields) {
    let convert;
    if (field.fieldKind == "message") {
      convert = compileConvertMessage(field);
    } else if (field.fieldKind == "scalar" && field.scalar == ScalarType.BYTES) {
      convert = toU8Arr;
    }
    converters.set(field.localName, convert !== null && convert !== void 0 ? convert : ((value) => value));
  }
  return converters;
}
function compileConvertMessage(field) {
  if (field.fieldKind == "message" && !field.oneof && isWrapperDesc(field.message)) {
    return field.message.fields[0].scalar == ScalarType.BYTES ? toU8Arr : void 0;
  }
  if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName !== "google.protobuf.Value") {
    return void 0;
  }
  const messageDesc2 = field.message;
  let compiled;
  return (value) => {
    if (!isObject(value) || isMessage(value, messageDesc2)) {
      return value;
    }
    compiled !== null && compiled !== void 0 ? compiled : compiled = compiledCreate(messageDesc2);
    return compiled(value);
  };
}
function toU8Arr(value) {
  return Array.isArray(value) ? new Uint8Array(value) : value;
}
function needsPrototypeChain(desc) {
  switch (desc.file.edition) {
    case EDITION_PROTO3:
      return false;
    case EDITION_PROTO2:
      return true;
    default:
      return desc.fields.some((f) => f.presence != IMPLICIT && f.fieldKind != "message" && !f.oneof);
  }
}
function createZeroValue(field) {
  const defaultValue = field.getDefaultValue();
  if (defaultValue !== void 0) {
    return field.fieldKind == "scalar" && field.longAsString ? defaultValue.toString() : defaultValue;
  }
  return field.fieldKind == "scalar" ? scalarZeroValue(field.scalar, field.longAsString) : field.enum.values[0].number;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/error.js
var FieldError = class extends Error {
  constructor(fieldOrOneof, message, name = "FieldValueInvalidError") {
    super(message);
    this.name = name;
    this.field = () => fieldOrOneof;
  }
};

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
var te;
function configureTextEncoding(textEncoding) {
  var _a;
  te = Object.assign(Object.assign({}, textEncoding), { encodeUtf8Into: (_a = textEncoding.encodeUtf8Into) !== null && _a !== void 0 ? _a : emulateEncodeInto(textEncoding.encodeUtf8.bind(textEncoding)) });
}
function getTextEncoding() {
  if (!te) {
    const globals = globalThis;
    if (!globals.TextEncoder || !globals.TextDecoder) {
      throw new Error("encoding API missing: install TextEncoder and TextDecoder on globalThis");
    }
    const textEncoder = new globals.TextEncoder();
    const textDecoder = new globals.TextDecoder("utf-8", {
      ignoreBOM: true
    });
    let textDecoderStrict;
    const config = {
      encodeUtf8(text) {
        return textEncoder.encode(text);
      },
      decodeUtf8(bytes, strict) {
        if (strict) {
          if (!textDecoderStrict) {
            textDecoderStrict = new globals.TextDecoder("utf-8", {
              fatal: true,
              ignoreBOM: true
            });
          }
          return textDecoderStrict.decode(bytes);
        }
        return textDecoder.decode(bytes);
      },
      checkUtf8(text) {
        try {
          encodeURIComponent(text);
          return true;
        } catch (_) {
          return false;
        }
      }
    };
    if (textEncoder.encodeInto) {
      config.encodeUtf8Into = textEncoder.encodeInto.bind(textEncoder);
    }
    const nativeStringIsWellFormed = String.prototype.isWellFormed;
    if (nativeStringIsWellFormed) {
      config.checkUtf8 = (text) => {
        return nativeStringIsWellFormed.call(text);
      };
    }
    configureTextEncoding(config);
  }
  return te;
}
function emulateEncodeInto(encodeUtf8) {
  return (text, dest) => {
    const bytes = encodeUtf8(text);
    dest.set(bytes);
    return { written: bytes.byteLength };
  };
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
var WireType;
(function(WireType2) {
  WireType2[WireType2["Varint"] = 0] = "Varint";
  WireType2[WireType2["Bit64"] = 1] = "Bit64";
  WireType2[WireType2["LengthDelimited"] = 2] = "LengthDelimited";
  WireType2[WireType2["StartGroup"] = 3] = "StartGroup";
  WireType2[WireType2["EndGroup"] = 4] = "EndGroup";
  WireType2[WireType2["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));
var UINT32_MAX = 4294967295;
var INT32_MAX = 2147483647;
var INT32_MIN = -2147483648;
var BinaryWriter = class {
  constructor(encodeUtf8) {
    this.stackPos = [];
    this.encodeUtf8Into = encodeUtf8 ? emulateEncodeInto(encodeUtf8) : getTextEncoding().encodeUtf8Into;
    this.buffer = EMPTY_BUFFER;
    this.viewCache = EMPTY_VIEW;
    this.pos = 0;
  }
  ensureCapacity(size) {
    const required = this.pos + size;
    if (required > this.buffer.length) {
      let newLen = this.buffer.length || INITIAL_SIZE;
      while (newLen < required)
        newLen *= 2;
      const newBuf = new Uint8Array(newLen);
      if (this.pos > 0)
        newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
  }
  /**
   * The DataView over `buffer`, rebuilt only if the buffer has grown since it
   * was last used.
   */
  view() {
    const bytes = this.buffer;
    const view = this.viewCache;
    if (view.byteLength === bytes.byteLength)
      return view;
    const newView = new DataView(bytes.buffer);
    this.viewCache = newView;
    return newView;
  }
  /**
   * Return all bytes written and reset this writer.
   */
  finish() {
    const result = this.buffer.slice(0, this.pos);
    this.pos = 0;
    this.stackPos = [];
    return result;
  }
  /**
   * Start a new fork for length-delimited data like a message
   * or a packed repeated field.
   *
   * Must be joined later with `join()`.
   */
  fork() {
    this.stackPos.push(this.pos);
    this.ensureCapacity(DEFAULT_LEN_PREFIX_SIZE);
    this.buffer[this.pos++] = 0;
    return this;
  }
  /**
   * Join the last fork. Write its length and bytes, then
   * return to the previous state.
   */
  join() {
    const forkPos = this.stackPos.pop();
    if (forkPos === void 0)
      throw new Error("invalid state, fork stack empty");
    const len = this.pos - forkPos - DEFAULT_LEN_PREFIX_SIZE;
    const lenPrefixSize = varint32Size(len);
    if (lenPrefixSize > DEFAULT_LEN_PREFIX_SIZE) {
      this.ensureCapacity(lenPrefixSize - DEFAULT_LEN_PREFIX_SIZE);
      this.buffer.copyWithin(forkPos + lenPrefixSize, forkPos + DEFAULT_LEN_PREFIX_SIZE, this.pos);
    }
    this.pos = forkPos;
    this.uint32(len);
    this.pos += len;
    return this;
  }
  /**
   * Writes a tag (field number and wire type).
   *
   * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
   *
   * Generated code should compute the tag ahead of time and call `uint32()`.
   */
  tag(fieldNo, type) {
    return this.uint32((fieldNo << 3 | type) >>> 0);
  }
  /**
   * Write a chunk of raw bytes.
   */
  raw(chunk) {
    this.ensureCapacity(chunk.length);
    this.buffer.set(chunk, this.pos);
    this.pos += chunk.length;
    return this;
  }
  /**
   * Write a `uint32` value, an unsigned 32 bit varint.
   */
  uint32(value) {
    assertUInt32(value);
    this.ensureCapacity(5);
    if (value < 128) {
      this.buffer[this.pos++] = value;
      return this;
    }
    while (value > 127) {
      this.buffer[this.pos++] = value & 127 | 128;
      value >>>= 7;
    }
    this.buffer[this.pos++] = value;
    return this;
  }
  /**
   * Write a `int32` value, a signed 32 bit varint.
   */
  int32(value) {
    assertInt32(value);
    if (value >= 0) {
      return this.uint32(value);
    }
    this.ensureCapacity(10);
    for (let i = 0; i < 9; i++) {
      this.buffer[this.pos++] = value & 127 | 128;
      value >>= 7;
    }
    this.buffer[this.pos++] = 1;
    return this;
  }
  /**
   * Write a `bool` value, a varint.
   */
  bool(value) {
    this.ensureCapacity(1);
    this.buffer[this.pos++] = value ? 1 : 0;
    return this;
  }
  /**
   * Write a `bytes` value, length-delimited arbitrary data.
   */
  bytes(value) {
    this.uint32(value.byteLength);
    return this.raw(value);
  }
  /**
   * Write a `string` value, length-delimited data converted to UTF-8 text.
   */
  string(value) {
    if (typeof value !== "string") {
      value = String(value);
    }
    const len = value.length;
    if (len <= ASCII_MAX_LENGTH) {
      this.ensureCapacity(len + 1);
      const ascii = this.buffer;
      let pos = this.pos;
      ascii[pos++] = len;
      let i = 0;
      for (; i < len; i++) {
        const code = value.charCodeAt(i);
        if (code > 127)
          break;
        ascii[pos++] = code;
      }
      if (i == len) {
        this.pos = pos;
        return this;
      }
    }
    this.ensureCapacity(len * 3 + 5);
    const lenPrefixSizeGuess = varint32Size(len);
    const buf = this.buffer;
    const start = this.pos;
    const { written } = this.encodeUtf8Into(value, buf.subarray(start + lenPrefixSizeGuess));
    const lenPrefixSize = varint32Size(written);
    if (lenPrefixSize != lenPrefixSizeGuess) {
      buf.copyWithin(start + lenPrefixSize, start + lenPrefixSizeGuess, start + lenPrefixSizeGuess + written);
    }
    this.uint32(written);
    this.pos += written;
    return this;
  }
  /**
   * Write a `float` value, 32-bit floating point number.
   */
  float(value) {
    assertFloat32(value);
    this.ensureCapacity(4);
    this.view().setFloat32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `double` value, a 64-bit floating point number.
   */
  double(value) {
    this.ensureCapacity(8);
    this.view().setFloat64(this.pos, value, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
   */
  fixed32(value) {
    assertUInt32(value);
    this.ensureCapacity(4);
    this.view().setUint32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
   */
  sfixed32(value) {
    assertInt32(value);
    this.ensureCapacity(4);
    this.view().setInt32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
   */
  sint32(value) {
    assertInt32(value);
    return this.uint32((value << 1 ^ value >> 31) >>> 0);
  }
  /**
   * Write a `sfixed64` value, a signed, fixed-length 64-bit integer.
   */
  sfixed64(value) {
    const tc = protoInt64.enc(value);
    this.ensureCapacity(8);
    const view = this.view();
    view.setInt32(this.pos, tc.lo, true);
    view.setInt32(this.pos + 4, tc.hi, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
   */
  fixed64(value) {
    const tc = protoInt64.uEnc(value);
    this.ensureCapacity(8);
    const view = this.view();
    view.setInt32(this.pos, tc.lo, true);
    view.setInt32(this.pos + 4, tc.hi, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `int64` value, a signed 64-bit varint.
   */
  int64(value) {
    const tc = protoInt64.enc(value);
    return this.writeVarint64(tc.lo, tc.hi);
  }
  /**
   * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64(value) {
    const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
    return this.writeVarint64(lo, hi);
  }
  /**
   * Write a `uint64` value, an unsigned 64-bit varint.
   */
  uint64(value) {
    const tc = protoInt64.uEnc(value);
    return this.writeVarint64(tc.lo, tc.hi);
  }
  /**
   * Write a 64-bit varint directly into the buffer. Accepts the value as
   * split low/high 32-bit words.
   *
   * Ported from varint64write() to avoid the intermediate number[] buffer.
   * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
   */
  writeVarint64(lo, hi) {
    this.ensureCapacity(10);
    const buf = this.buffer;
    let pos = this.pos;
    for (let i = 0; i < 28; i = i + 7) {
      const shift = lo >>> i;
      const hasNext = !(shift >>> 7 == 0 && hi == 0);
      buf[pos++] = (hasNext ? shift | 128 : shift) & 255;
      if (!hasNext) {
        this.pos = pos;
        return this;
      }
    }
    const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
    const hasMoreBits = !(hi >> 3 == 0);
    buf[pos++] = (hasMoreBits ? splitBits | 128 : splitBits) & 255;
    if (!hasMoreBits) {
      this.pos = pos;
      return this;
    }
    for (let i = 3; i < 31; i = i + 7) {
      const shift = hi >>> i;
      const hasNext = !(shift >>> 7 == 0);
      buf[pos++] = (hasNext ? shift | 128 : shift) & 255;
      if (!hasNext) {
        this.pos = pos;
        return this;
      }
    }
    buf[pos++] = hi >>> 31 & 1;
    this.pos = pos;
    return this;
  }
};
var INITIAL_SIZE = 128;
var DEFAULT_LEN_PREFIX_SIZE = 1;
var EMPTY_BUFFER = new Uint8Array(0);
var EMPTY_VIEW = new DataView(EMPTY_BUFFER.buffer);
var ASCII_MAX_LENGTH = 32;
function varint32Size(value) {
  if (value < 128)
    return 1;
  if (value < 16384)
    return 2;
  if (value < 2097152)
    return 3;
  if (value < 268435456)
    return 4;
  return 5;
}
var BinaryReader = class {
  constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
    this.decodeUtf8 = decodeUtf8;
    this.varint64Lo = 0;
    this.varint64Hi = 0;
    this.varint64 = varint64read;
    this.uint32 = varint32read;
    this.buf = buf;
    this.len = buf.length;
    this.pos = 0;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  /**
   * Reads a tag - field number and wire type. Tags are uint32 varints; values
   * that do not fit in uint32 are rejected.
   */
  tag() {
    const start = this.pos;
    const tag = this.uint32();
    const bytesRead = this.pos - start;
    if (bytesRead > 5 || bytesRead == 5 && this.buf[this.pos - 1] > 15) {
      throw new Error("illegal tag: varint overflows uint32");
    }
    const fieldNo = tag >>> 3;
    const wireType = tag & 7;
    if (fieldNo <= 0 || wireType > 5) {
      throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
    }
    return [fieldNo, wireType];
  }
  /**
   * Skip one element and return the skipped data.
   *
   * When skipping StartGroup, provide the tags field number to check for
   * matching field number in the EndGroup tag. Recursion into nested groups
   * is guarded by the `recursionLimit` argument: When the limit is reached,
   * this method throws.
   */
  skip(wireType, fieldNo, recursionLimit = 100) {
    let start = this.pos;
    switch (wireType) {
      case WireType.Varint:
        while (this.buf[this.pos++] & 128) {
        }
        break;
      // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
      case WireType.Bit64:
        this.pos += 4;
      case WireType.Bit32:
        this.pos += 4;
        break;
      case WireType.LengthDelimited:
        let len = this.uint32();
        this.pos += len;
        break;
      case WireType.StartGroup:
        if (recursionLimit <= 0) {
          throw new Error("maximum recursion depth reached");
        }
        for (; ; ) {
          const [fn, wt] = this.tag();
          if (wt === WireType.EndGroup) {
            if (fieldNo !== void 0 && fn !== fieldNo) {
              throw new Error("invalid end group tag");
            }
            break;
          }
          this.skip(wt, fn, recursionLimit - 1);
        }
        break;
      default:
        throw new Error("cant skip wire type " + wireType);
    }
    this.assertBounds();
    return this.buf.subarray(start, this.pos);
  }
  /**
   * Throws error if position in byte array is out of range.
   */
  assertBounds() {
    if (this.pos > this.len)
      throw new RangeError("premature EOF");
  }
  /**
   * Read a `int32` field, a signed 32 bit varint.
   */
  int32() {
    return this.uint32() | 0;
  }
  /**
   * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
   */
  sint32() {
    let zze = this.uint32();
    return zze >>> 1 ^ -(zze & 1);
  }
  /**
   * Read a `int64` field, a signed 64-bit varint.
   */
  int64() {
    this.varint64();
    return protoInt64.dec(this.varint64Lo, this.varint64Hi);
  }
  /**
   * Read a `uint64` field, an unsigned 64-bit varint.
   */
  uint64() {
    this.varint64();
    return protoInt64.uDec(this.varint64Lo, this.varint64Hi);
  }
  /**
   * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64() {
    this.varint64();
    let lo = this.varint64Lo;
    let hi = this.varint64Hi;
    let s = -(lo & 1);
    lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
    hi = hi >>> 1 ^ s;
    return protoInt64.dec(lo, hi);
  }
  /**
   * Read a `bool` field, a variant.
   */
  bool() {
    const b = this.buf[this.pos];
    if (b < 128) {
      this.pos++;
      return b !== 0;
    }
    this.varint64();
    return this.varint64Lo !== 0 || this.varint64Hi !== 0;
  }
  /**
   * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
   */
  fixed32() {
    return this.view.getUint32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
   */
  sfixed32() {
    return this.view.getInt32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
   */
  fixed64() {
    return protoInt64.uDec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
   */
  sfixed64() {
    return protoInt64.dec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `float` field, 32-bit floating point number.
   */
  float() {
    return this.view.getFloat32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `double` field, a 64-bit floating point number.
   */
  double() {
    return this.view.getFloat64((this.pos += 8) - 8, true);
  }
  /**
   * Read a `bytes` field, length-delimited arbitrary data.
   */
  bytes() {
    let len = this.uint32(), start = this.pos;
    this.pos += len;
    this.assertBounds();
    return this.buf.subarray(start, start + len);
  }
  /**
   * Read a `string` field, length-delimited data converted to UTF-8 text. If
   * `strict` is true, throw on invalid UTF-8 instead of substituting U+FFFD.
   */
  string(strict) {
    const len = this.uint32();
    const start = this.pos;
    this.pos += len;
    this.assertBounds();
    const buf = this.buf;
    if (len <= ASCII_MAX_LENGTH) {
      const codes = new Array(len);
      for (let i = 0; i < len; i++) {
        const byte = buf[start + i];
        if (byte > 127) {
          return this.decodeUtf8(buf.subarray(start, this.pos), strict);
        }
        codes[i] = byte;
      }
      return String.fromCharCode.apply(String, codes);
    }
    return this.decodeUtf8(buf.subarray(start, this.pos), strict);
  }
};
function assertInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid int32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
    throw new Error("invalid int32: " + arg);
}
function assertUInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid uint32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
    throw new Error("invalid uint32: " + arg);
}
function assertFloat32(arg) {
  if (typeof arg == "string") {
    const o = arg;
    arg = Number(arg);
    if (Number.isNaN(arg) && o !== "NaN") {
      throw new Error("invalid float32: " + o);
    }
  } else if (typeof arg != "number") {
    throw new Error("invalid float32: " + typeof arg);
  }
  if (!Number.isFinite(Math.fround(arg)) && Number.isFinite(arg)) {
    throw new Error("invalid float32: " + arg);
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/message.js
var NULL_VALUE = 0;
function localMessageMapper(field) {
  if (usesJsonRepresentation(field)) {
    return {
      toMessage: (local) => wktStructToReflect(local),
      toLocal: (message) => wktStructToLocal(message)
    };
  }
  if (field.fieldKind == "message" && !field.oneof && isWrapperDesc(field.message)) {
    const wrapperDesc = field.message;
    const valueLocalName = wrapperDesc.fields[0].localName;
    return {
      toMessage: (local) => {
        const message = create(wrapperDesc);
        if (local !== void 0) {
          message[valueLocalName] = local;
        }
        return message;
      },
      toLocal: (message) => message[valueLocalName]
    };
  }
  const childDesc = field.message;
  return {
    toMessage: (local) => local === void 0 ? create(childDesc) : local,
    toLocal: (message) => message
  };
}
function usesJsonRepresentation(field) {
  return field.message.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value";
}
function wktStructToReflect(json) {
  const struct = {
    $typeName: "google.protobuf.Struct",
    fields: {}
  };
  if (isObject(json)) {
    for (const k of Object.keys(json)) {
      setOwn(struct.fields, k, wktValueToReflect(json[k]));
    }
  }
  return struct;
}
function wktStructToLocal(val) {
  const json = {};
  for (const k of Object.keys(val.fields)) {
    setOwn(json, k, wktValueToLocal(val.fields[k]));
  }
  return json;
}
function wktValueToLocal(val) {
  switch (val.kind.case) {
    case "structValue":
      return wktStructToLocal(val.kind.value);
    case "listValue":
      return val.kind.value.values.map(wktValueToLocal);
    case "nullValue":
    case void 0:
      return null;
    default:
      return val.kind.value;
  }
}
function wktValueToReflect(json) {
  const value = {
    $typeName: "google.protobuf.Value",
    kind: { case: void 0 }
  };
  switch (typeof json) {
    case "number":
      value.kind = { case: "numberValue", value: json };
      break;
    case "string":
      value.kind = { case: "stringValue", value: json };
      break;
    case "boolean":
      value.kind = { case: "boolValue", value: json };
      break;
    case "object":
      if (json === null) {
        value.kind = { case: "nullValue", value: NULL_VALUE };
      } else if (Array.isArray(json)) {
        const listValue = {
          $typeName: "google.protobuf.ListValue",
          values: []
        };
        if (Array.isArray(json)) {
          for (const e of json) {
            listValue.values.push(wktValueToReflect(e));
          }
        }
        value.kind = {
          case: "listValue",
          value: listValue
        };
      } else {
        value.kind = {
          case: "structValue",
          value: wktStructToReflect(json)
        };
      }
      break;
  }
  return value;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wire/base64-encoding.js
var nativeSetFromBase64 = Uint8Array.prototype.setFromBase64;
function base64Decode(base64Str) {
  const len = base64Str.length;
  let size = len - (len + 3 >> 2);
  if ((len & 3) == 0 && base64Str[len - 1] == "=") {
    size -= base64Str[len - 2] == "=" ? 2 : 1;
  }
  const bytes = new Uint8Array(size);
  let written = -1;
  if (nativeSetFromBase64) {
    try {
      const result = nativeSetFromBase64.call(bytes, base64Str);
      if (result.read == len) {
        written = result.written;
      }
    } catch (_a) {
    }
  }
  if (written < 0) {
    written = setFromBase64(bytes, base64Str);
  }
  return written == size ? bytes : bytes.subarray(0, written);
}
function setFromBase64(bytes, base64Str) {
  const table = getDecodeTable();
  let bytePos = 0, groupPos = 0, b, p = 0;
  for (let i = 0; i < base64Str.length; i++) {
    b = table[base64Str.charCodeAt(i)];
    if (b === void 0) {
      switch (base64Str[i]) {
        // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
        case "=":
          groupPos = 0;
        // reset state when padding found
        case "\n":
        case "\r":
        case "	":
        case " ":
          continue;
        // skip white-space, and padding
        default:
          throw Error("invalid base64 string");
      }
    }
    switch (groupPos) {
      case 0:
        p = b;
        groupPos = 1;
        break;
      case 1:
        bytes[bytePos++] = p << 2 | (b & 48) >> 4;
        p = b;
        groupPos = 2;
        break;
      case 2:
        bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
        p = b;
        groupPos = 3;
        break;
      case 3:
        bytes[bytePos++] = (p & 3) << 6 | b;
        groupPos = 0;
        break;
    }
  }
  if (groupPos == 1)
    throw Error("invalid base64 string");
  return bytePos;
}
var nativeToBase64 = Uint8Array.prototype.toBase64;
var encodeTableStd;
var encodeTableUrl;
var decodeTable;
function getEncodeTable(encoding) {
  if (!encodeTableStd) {
    encodeTableStd = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
    encodeTableUrl = encodeTableStd.slice(0, -2).concat("-", "_");
  }
  return encoding == "url" ? (
    // biome-ignore lint/style/noNonNullAssertion: TS fails to narrow down
    encodeTableUrl
  ) : encodeTableStd;
}
function getDecodeTable() {
  if (!decodeTable) {
    decodeTable = [];
    const encodeTable = getEncodeTable("std");
    for (let i = 0; i < encodeTable.length; i++)
      decodeTable[encodeTable[i].charCodeAt(0)] = i;
    decodeTable["-".charCodeAt(0)] = encodeTable.indexOf("+");
    decodeTable["_".charCodeAt(0)] = encodeTable.indexOf("/");
  }
  return decodeTable;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/names.js
function protoCamelCase(snakeCase) {
  let capNext = false;
  const b = [];
  for (let i = 0; i < snakeCase.length; i++) {
    let c = snakeCase.charAt(i);
    switch (c) {
      case "_":
        capNext = true;
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        b.push(c);
        capNext = false;
        break;
      default:
        if (capNext) {
          capNext = false;
          c = c.toUpperCase();
        }
        b.push(c);
        break;
    }
  }
  return b.join("");
}
var reservedObjectProperties = /* @__PURE__ */ new Set([
  // names reserved by JavaScript
  "constructor",
  "toString",
  "toJSON",
  "valueOf"
]);
function safeObjectProperty(name) {
  return reservedObjectProperties.has(name) ? name + "$" : name;
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/restore-json-names.js
function restoreJsonNames(message) {
  for (const f of message.field) {
    if (!unsafeIsSetExplicit(f, "jsonName")) {
      f.jsonName = protoCamelCase(f.name);
    }
  }
  message.nestedType.forEach(restoreJsonNames);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wire/text-format.js
function parseTextFormatEnumValue(descEnum, value) {
  const enumValue = descEnum.values.find((v) => v.name === value);
  if (!enumValue) {
    throw new Error(`cannot parse ${descEnum} default value: ${value}`);
  }
  return enumValue.number;
}
function parseTextFormatScalarValue(type, value) {
  switch (type) {
    case ScalarType.STRING:
      return value;
    case ScalarType.BYTES: {
      const u = unescapeBytesDefaultValue(value);
      if (u === false) {
        throw new Error(`cannot parse ${ScalarType[type]} default value: ${value}`);
      }
      return u;
    }
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      return protoInt64.parse(value);
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      return protoInt64.uParse(value);
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      switch (value) {
        case "inf":
          return Number.POSITIVE_INFINITY;
        case "-inf":
          return Number.NEGATIVE_INFINITY;
        case "nan":
          return Number.NaN;
        default:
          return parseFloat(value);
      }
    case ScalarType.BOOL:
      return value === "true";
    case ScalarType.INT32:
    case ScalarType.UINT32:
    case ScalarType.SINT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
      return parseInt(value, 10);
  }
}
function unescapeBytesDefaultValue(str) {
  const b = [];
  const input = {
    tail: str,
    c: "",
    next() {
      if (this.tail.length == 0) {
        return false;
      }
      this.c = this.tail[0];
      this.tail = this.tail.substring(1);
      return true;
    },
    take(n) {
      if (this.tail.length >= n) {
        const r = this.tail.substring(0, n);
        this.tail = this.tail.substring(n);
        return r;
      }
      return false;
    }
  };
  while (input.next()) {
    switch (input.c) {
      case "\\":
        if (input.next()) {
          switch (input.c) {
            case "\\":
              b.push(input.c.charCodeAt(0));
              break;
            case "b":
              b.push(8);
              break;
            case "f":
              b.push(12);
              break;
            case "n":
              b.push(10);
              break;
            case "r":
              b.push(13);
              break;
            case "t":
              b.push(9);
              break;
            case "v":
              b.push(11);
              break;
            case "0":
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7": {
              const s = input.c;
              const t = input.take(2);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 8);
              if (Number.isNaN(n)) {
                return false;
              }
              b.push(n);
              break;
            }
            case "x": {
              const s = input.c;
              const t = input.take(2);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 16);
              if (Number.isNaN(n)) {
                return false;
              }
              b.push(n);
              break;
            }
            case "u": {
              const s = input.c;
              const t = input.take(4);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 16);
              if (Number.isNaN(n)) {
                return false;
              }
              const chunk = new Uint8Array(4);
              const view = new DataView(chunk.buffer);
              view.setInt32(0, n, true);
              b.push(chunk[0], chunk[1], chunk[2], chunk[3]);
              break;
            }
            case "U": {
              const s = input.c;
              const t = input.take(8);
              if (t === false) {
                return false;
              }
              const tc = protoInt64.uEnc(s + t);
              const chunk = new Uint8Array(8);
              const view = new DataView(chunk.buffer);
              view.setInt32(0, tc.lo, true);
              view.setInt32(4, tc.hi, true);
              b.push(chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7]);
              break;
            }
          }
        }
        break;
      default:
        b.push(input.c.charCodeAt(0));
    }
  }
  return new Uint8Array(b);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/reflect/nested-types.js
function* nestedTypes(desc) {
  switch (desc.kind) {
    case "file":
      for (const message of desc.messages) {
        yield message;
        yield* nestedTypes(message);
      }
      yield* desc.enums;
      yield* desc.services;
      yield* desc.extensions;
      break;
    case "message":
      for (const message of desc.nestedMessages) {
        yield message;
        yield* nestedTypes(message);
      }
      yield* desc.nestedEnums;
      yield* desc.nestedExtensions;
      break;
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/registry.js
function createEmbeddedFileRegistry(fileDescriptorProto, resolve) {
  return buildFileRegistry([fileDescriptorProto, resolve]);
}
function buildFileRegistry(args, check) {
  const registry = createBaseRegistry();
  if (!args.length) {
    return registry;
  }
  if ("$typeName" in args[0] && args[0].$typeName == "google.protobuf.FileDescriptorSet") {
    for (const file of args[0].file) {
      check === null || check === void 0 ? void 0 : check(file);
      addFile(file, registry);
    }
    return registry;
  }
  if ("$typeName" in args[0]) {
    let recurseDeps = function(file) {
      const deps = [];
      for (const protoFileName of file.dependency) {
        if (registry.getFile(protoFileName) != void 0) {
          continue;
        }
        if (seen.has(protoFileName)) {
          continue;
        }
        const dep = resolve(protoFileName);
        if (!dep) {
          throw new Error(`Unable to resolve ${protoFileName}, imported by ${file.name}`);
        }
        if ("kind" in dep) {
          registry.addFile(dep, false, true);
        } else {
          seen.add(dep.name);
          deps.push(dep);
        }
      }
      return deps.concat(...deps.map(recurseDeps));
    };
    const input = args[0];
    const resolve = args[1];
    const seen = /* @__PURE__ */ new Set();
    for (const file of [input, ...recurseDeps(input)].reverse()) {
      check === null || check === void 0 ? void 0 : check(file);
      addFile(file, registry);
    }
  } else {
    for (const fileReg of args) {
      for (const file of fileReg.files) {
        registry.addFile(file);
      }
    }
  }
  return registry;
}
function createBaseRegistry() {
  const types = /* @__PURE__ */ new Map();
  const extendees = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Map();
  return {
    kind: "registry",
    types,
    extendees,
    [Symbol.iterator]() {
      return types.values();
    },
    get files() {
      return files.values();
    },
    addFile(file, skipTypes, withDeps) {
      files.set(file.proto.name, file);
      if (!skipTypes) {
        for (const type of nestedTypes(file)) {
          this.add(type);
        }
      }
      if (withDeps) {
        for (const f of file.dependencies) {
          this.addFile(f, skipTypes, withDeps);
        }
      }
    },
    add(desc) {
      if (desc.kind == "extension") {
        let numberToExt = extendees.get(desc.extendee.typeName);
        if (!numberToExt) {
          extendees.set(
            desc.extendee.typeName,
            // biome-ignore lint/suspicious/noAssignInExpressions: no
            numberToExt = /* @__PURE__ */ new Map()
          );
        }
        numberToExt.set(desc.number, desc);
      }
      types.set(desc.typeName, desc);
    },
    get(typeName) {
      return types.get(typeName);
    },
    getFile(fileName) {
      return files.get(fileName);
    },
    getMessage(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "message" ? t : void 0;
    },
    getEnum(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "enum" ? t : void 0;
    },
    getExtension(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "extension" ? t : void 0;
    },
    getExtensionFor(extendee, no) {
      var _a;
      return (_a = extendees.get(extendee.typeName)) === null || _a === void 0 ? void 0 : _a.get(no);
    },
    getService(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "service" ? t : void 0;
    }
  };
}
var EDITION_PROTO22 = 998;
var EDITION_PROTO32 = 999;
var EDITION_UNSTABLE = 9999;
var TYPE_STRING = 9;
var TYPE_GROUP = 10;
var TYPE_MESSAGE = 11;
var TYPE_BYTES = 12;
var TYPE_ENUM = 14;
var LABEL_REPEATED = 3;
var LABEL_REQUIRED = 2;
var JS_STRING = 1;
var IDEMPOTENCY_UNKNOWN = 0;
var EXPLICIT = 1;
var IMPLICIT2 = 2;
var LEGACY_REQUIRED = 3;
var PACKED = 1;
var DELIMITED = 2;
var OPEN = 1;
var VERIFY = 2;
var maximumEdition = 1002;
var featureDefaults = {
  // EDITION_PROTO2
  998: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 2,
    // CLOSED,
    repeatedFieldEncoding: 2,
    // EXPANDED,
    utf8Validation: 3,
    // NONE,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 2,
    // LEGACY_BEST_EFFORT,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1,
    // EXPORT_ALL,
    enforceProtoLimits: 1
    // LEGACY_NO_EXPLICIT_LIMITS,
  },
  // EDITION_PROTO3
  999: {
    fieldPresence: 2,
    // IMPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1,
    // EXPORT_ALL,
    enforceProtoLimits: 1
    // LEGACY_NO_EXPLICIT_LIMITS,
  },
  // EDITION_2023
  1e3: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1,
    // EXPORT_ALL,
    enforceProtoLimits: 1
    // LEGACY_NO_EXPLICIT_LIMITS,
  },
  // EDITION_2024
  1001: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 1,
    // STYLE2024,
    defaultSymbolVisibility: 2,
    // EXPORT_TOP_LEVEL,
    enforceProtoLimits: 1
    // LEGACY_NO_EXPLICIT_LIMITS,
  },
  // EDITION_2026
  1002: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 3,
    // STYLE2026,
    defaultSymbolVisibility: 4,
    // STRICT,
    enforceProtoLimits: 2
    // PROTO_LIMITS2026,
  }
};
function addFile(proto, reg) {
  var _a, _b;
  const file = {
    kind: "file",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    edition: getFileEdition(proto),
    name: proto.name.replace(/\.proto$/, ""),
    dependencies: findFileDependencies(proto, reg),
    enums: [],
    messages: [],
    extensions: [],
    services: [],
    toString() {
      return `file ${proto.name}`;
    }
  };
  const mapEntriesStore = /* @__PURE__ */ new Map();
  const mapEntries = {
    get(typeName) {
      return mapEntriesStore.get(typeName);
    },
    add(desc) {
      var _a2;
      assert(((_a2 = desc.proto.options) === null || _a2 === void 0 ? void 0 : _a2.mapEntry) === true);
      mapEntriesStore.set(desc.typeName, desc);
    }
  };
  for (const enumProto of proto.enumType) {
    addEnum(enumProto, file, void 0, reg);
  }
  for (const messageProto of proto.messageType) {
    addMessage(messageProto, file, void 0, reg, mapEntries);
  }
  for (const serviceProto of proto.service) {
    addService(serviceProto, file, reg);
  }
  addExtensions(file, reg);
  for (const mapEntry of mapEntriesStore.values()) {
    addFields(mapEntry, reg, mapEntries);
  }
  for (const message of file.messages) {
    addFields(message, reg, mapEntries);
    addExtensions(message, reg);
  }
  reg.addFile(file, true);
}
function addExtensions(desc, reg) {
  switch (desc.kind) {
    case "file":
      for (const proto of desc.proto.extension) {
        const ext = newField(proto, desc, reg);
        desc.extensions.push(ext);
        reg.add(ext);
      }
      break;
    case "message":
      for (const proto of desc.proto.extension) {
        const ext = newField(proto, desc, reg);
        desc.nestedExtensions.push(ext);
        reg.add(ext);
      }
      for (const message of desc.nestedMessages) {
        addExtensions(message, reg);
      }
      break;
  }
}
function addFields(message, reg, mapEntries) {
  const allOneofs = message.proto.oneofDecl.map((proto) => newOneof(proto, message));
  const oneofsSeen = /* @__PURE__ */ new Set();
  for (const proto of message.proto.field) {
    const oneof = findOneof(proto, allOneofs);
    const field = newField(proto, message, reg, oneof, mapEntries);
    message.fields.push(field);
    message.field[field.localName] = field;
    if (oneof === void 0) {
      message.members.push(field);
    } else {
      oneof.fields.push(field);
      if (!oneofsSeen.has(oneof)) {
        oneofsSeen.add(oneof);
        message.members.push(oneof);
      }
    }
  }
  for (const oneof of allOneofs.filter((o) => oneofsSeen.has(o))) {
    message.oneofs.push(oneof);
  }
  for (const child of message.nestedMessages) {
    addFields(child, reg, mapEntries);
  }
}
function addEnum(proto, file, parent, reg) {
  var _a, _b, _c, _d, _e, _f, _g;
  var _h, _j;
  const sharedPrefix = findEnumSharedPrefix(proto.name, proto.value);
  const desc = {
    kind: "enum",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    parent,
    open: true,
    name: proto.name,
    typeName: makeTypeName(proto, parent, file),
    value: {},
    values: [],
    sharedPrefix,
    toString() {
      return `enum ${this.typeName}`;
    }
  };
  desc.open = isEnumOpen(desc);
  reg.add(desc);
  for (const p of proto.value) {
    const name = p.name;
    const value = {
      kind: "enum_value",
      proto: p,
      deprecated: (_d = (_c = p.options) === null || _c === void 0 ? void 0 : _c.deprecated) !== null && _d !== void 0 ? _d : false,
      parent: desc,
      name,
      localName: safeObjectProperty(sharedPrefix == void 0 ? name : name.substring(sharedPrefix.length)),
      number: p.number,
      jsonName: (_e = findEnumValueJsonName(p)) !== null && _e !== void 0 ? _e : name,
      toString() {
        return `enum value ${desc.typeName}.${name}`;
      }
    };
    desc.values.push(value);
    (_f = (_h = desc.value)[_j = p.number]) !== null && _f !== void 0 ? _f : _h[_j] = value;
  }
  ((_g = parent === null || parent === void 0 ? void 0 : parent.nestedEnums) !== null && _g !== void 0 ? _g : file.enums).push(desc);
}
function addMessage(proto, file, parent, reg, mapEntries) {
  var _a, _b, _c, _d;
  const desc = {
    kind: "message",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    parent,
    name: proto.name,
    typeName: makeTypeName(proto, parent, file),
    fields: [],
    field: {},
    oneofs: [],
    members: [],
    nestedEnums: [],
    nestedMessages: [],
    nestedExtensions: [],
    toString() {
      return `message ${this.typeName}`;
    }
  };
  if (((_c = proto.options) === null || _c === void 0 ? void 0 : _c.mapEntry) === true) {
    mapEntries.add(desc);
  } else {
    ((_d = parent === null || parent === void 0 ? void 0 : parent.nestedMessages) !== null && _d !== void 0 ? _d : file.messages).push(desc);
    reg.add(desc);
  }
  for (const enumProto of proto.enumType) {
    addEnum(enumProto, file, desc, reg);
  }
  for (const messageProto of proto.nestedType) {
    addMessage(messageProto, file, desc, reg, mapEntries);
  }
}
function addService(proto, file, reg) {
  var _a, _b;
  const desc = {
    kind: "service",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    name: proto.name,
    typeName: makeTypeName(proto, void 0, file),
    methods: [],
    method: {},
    toString() {
      return `service ${this.typeName}`;
    }
  };
  file.services.push(desc);
  reg.add(desc);
  for (const methodProto of proto.method) {
    const method = newMethod(methodProto, desc, reg);
    desc.methods.push(method);
    desc.method[method.localName] = method;
  }
}
function newMethod(proto, parent, reg) {
  var _a, _b, _c, _d;
  let methodKind;
  if (proto.clientStreaming && proto.serverStreaming) {
    methodKind = "bidi_streaming";
  } else if (proto.clientStreaming) {
    methodKind = "client_streaming";
  } else if (proto.serverStreaming) {
    methodKind = "server_streaming";
  } else {
    methodKind = "unary";
  }
  const input = reg.getMessage(trimLeadingDot(proto.inputType));
  const output = reg.getMessage(trimLeadingDot(proto.outputType));
  assert(input, `invalid MethodDescriptorProto: input_type ${proto.inputType} not found`);
  assert(output, `invalid MethodDescriptorProto: output_type ${proto.inputType} not found`);
  const name = proto.name;
  return {
    kind: "rpc",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    parent,
    name,
    localName: safeObjectProperty(name.length ? safeObjectProperty(name[0].toLowerCase() + name.substring(1)) : name),
    methodKind,
    input,
    output,
    idempotency: (_d = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.idempotencyLevel) !== null && _d !== void 0 ? _d : IDEMPOTENCY_UNKNOWN,
    toString() {
      return `rpc ${parent.typeName}.${name}`;
    }
  };
}
function newOneof(proto, parent) {
  return {
    kind: "oneof",
    proto,
    deprecated: false,
    parent,
    fields: [],
    name: proto.name,
    localName: safeObjectProperty(protoCamelCase(proto.name)),
    toString() {
      return `oneof ${parent.typeName}.${this.name}`;
    }
  };
}
function newField(proto, parentOrFile, reg, oneof, mapEntries) {
  var _a, _b, _c;
  const isExtension = mapEntries === void 0;
  const field = {
    kind: "field",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    name: proto.name,
    number: proto.number,
    scalar: void 0,
    message: void 0,
    enum: void 0,
    presence: getFieldPresence(proto, oneof, isExtension, parentOrFile),
    utf8Validation: isUtf8Validated(proto, parentOrFile),
    listKind: void 0,
    mapKind: void 0,
    mapKey: void 0,
    delimitedEncoding: void 0,
    packed: void 0,
    longAsString: false,
    getDefaultValue: void 0
  };
  let toStr;
  if (isExtension) {
    const file = parentOrFile.kind == "file" ? parentOrFile : parentOrFile.file;
    const parent = parentOrFile.kind == "file" ? void 0 : parentOrFile;
    const typeName = makeTypeName(proto, parent, file);
    field.kind = "extension";
    field.file = file;
    field.parent = parent;
    field.oneof = void 0;
    field.typeName = typeName;
    field.jsonName = `[${typeName}]`;
    toStr = () => `extension ${typeName}`;
    const extendee = reg.getMessage(trimLeadingDot(proto.extendee));
    assert(extendee, `invalid FieldDescriptorProto: extendee ${proto.extendee} not found`);
    field.extendee = extendee;
  } else {
    const parent = parentOrFile;
    assert(parent.kind == "message");
    field.parent = parent;
    field.oneof = oneof;
    field.localName = oneof ? protoCamelCase(proto.name) : safeObjectProperty(protoCamelCase(proto.name));
    field.jsonName = proto.jsonName;
    toStr = () => `field ${parent.typeName}.${proto.name}`;
  }
  Object.defineProperty(field, "toString", {
    value: toStr,
    writable: true,
    enumerable: true,
    configurable: true
  });
  const label = proto.label;
  const type = proto.type;
  const jstype = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.jstype;
  if (label === LABEL_REPEATED) {
    const mapEntry = type == TYPE_MESSAGE ? mapEntries === null || mapEntries === void 0 ? void 0 : mapEntries.get(trimLeadingDot(proto.typeName)) : void 0;
    if (mapEntry) {
      field.fieldKind = "map";
      const { key, value } = findMapEntryFields(mapEntry);
      field.mapKey = key.scalar;
      field.mapKind = value.fieldKind;
      field.message = value.message;
      field.delimitedEncoding = false;
      field.enum = value.enum;
      field.scalar = value.scalar;
      return field;
    }
    field.fieldKind = "list";
    switch (type) {
      case TYPE_MESSAGE:
      case TYPE_GROUP:
        field.listKind = "message";
        field.message = reg.getMessage(trimLeadingDot(proto.typeName));
        assert(field.message);
        field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
        break;
      case TYPE_ENUM:
        field.listKind = "enum";
        field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
        assert(field.enum);
        break;
      default:
        field.listKind = "scalar";
        field.scalar = type;
        field.longAsString = jstype == JS_STRING;
        break;
    }
    field.packed = isPackedField(proto, parentOrFile);
    return field;
  }
  switch (type) {
    case TYPE_MESSAGE:
    case TYPE_GROUP:
      field.fieldKind = "message";
      field.message = reg.getMessage(trimLeadingDot(proto.typeName));
      assert(field.message, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
      field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
      field.getDefaultValue = () => void 0;
      break;
    case TYPE_ENUM: {
      const enumeration = reg.getEnum(trimLeadingDot(proto.typeName));
      assert(enumeration !== void 0, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
      field.fieldKind = "enum";
      field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
      field.getDefaultValue = () => {
        return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatEnumValue(enumeration, proto.defaultValue) : void 0;
      };
      break;
    }
    default: {
      field.fieldKind = "scalar";
      field.scalar = type;
      field.longAsString = jstype == JS_STRING;
      field.getDefaultValue = () => {
        return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatScalarValue(type, proto.defaultValue) : void 0;
      };
      break;
    }
  }
  return field;
}
function getFileEdition(proto) {
  switch (proto.syntax) {
    case "":
    case "proto2":
      return EDITION_PROTO22;
    case "proto3":
      return EDITION_PROTO32;
    case "editions":
      if (proto.edition === EDITION_UNSTABLE) {
        return maximumEdition;
      }
      if (proto.edition in featureDefaults) {
        return proto.edition;
      }
      throw new Error(`${proto.name}: unsupported edition`);
    default:
      throw new Error(`${proto.name}: unsupported syntax "${proto.syntax}"`);
  }
}
function findFileDependencies(proto, reg) {
  return proto.dependency.map((wantName) => {
    const dep = reg.getFile(wantName);
    if (!dep) {
      throw new Error(`Cannot find ${wantName}, imported by ${proto.name}`);
    }
    return dep;
  });
}
function findEnumSharedPrefix(enumName, values) {
  const prefix = camelToSnakeCase(enumName) + "_";
  for (const value of values) {
    if (!value.name.toLowerCase().startsWith(prefix)) {
      return void 0;
    }
    const shortName = value.name.substring(prefix.length);
    if (shortName.length == 0) {
      return void 0;
    }
    if (/^\d/.test(shortName)) {
      return void 0;
    }
  }
  return prefix;
}
function findEnumValueJsonName(proto) {
  var _a, _b;
  const extensionNumber = 998;
  const fieldNumber = 1;
  let jsonName;
  for (const uf of (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.$unknown) !== null && _b !== void 0 ? _b : []) {
    if (uf.no !== extensionNumber || uf.wireType !== WireType.LengthDelimited) {
      continue;
    }
    const reader = new BinaryReader(new BinaryReader(uf.data).bytes());
    while (reader.pos < reader.len) {
      const [no, wireType] = reader.tag();
      if (no === fieldNumber && wireType === WireType.LengthDelimited) {
        jsonName = reader.string();
      } else {
        reader.skip(wireType, no);
      }
    }
  }
  return jsonName;
}
function camelToSnakeCase(camel) {
  return (camel.substring(0, 1) + camel.substring(1).replace(/[A-Z]/g, (c) => "_" + c)).toLowerCase();
}
function makeTypeName(proto, parent, file) {
  let typeName;
  if (parent) {
    typeName = `${parent.typeName}.${proto.name}`;
  } else if (file.proto.package.length > 0) {
    typeName = `${file.proto.package}.${proto.name}`;
  } else {
    typeName = `${proto.name}`;
  }
  return typeName;
}
function trimLeadingDot(typeName) {
  return typeName.startsWith(".") ? typeName.substring(1) : typeName;
}
function findOneof(proto, allOneofs) {
  if (!unsafeIsSetExplicit(proto, "oneofIndex")) {
    return void 0;
  }
  if (proto.proto3Optional) {
    return void 0;
  }
  const oneof = allOneofs[proto.oneofIndex];
  assert(oneof, `invalid FieldDescriptorProto: oneof #${proto.oneofIndex} for field #${proto.number} not found`);
  return oneof;
}
function getFieldPresence(proto, oneof, isExtension, parent) {
  if (proto.label == LABEL_REQUIRED) {
    return LEGACY_REQUIRED;
  }
  if (proto.label == LABEL_REPEATED) {
    return IMPLICIT2;
  }
  if (!!oneof || proto.proto3Optional) {
    return EXPLICIT;
  }
  if (isExtension) {
    return EXPLICIT;
  }
  const resolved = resolveFeature("fieldPresence", { proto, parent });
  if (resolved == IMPLICIT2 && (proto.type == TYPE_MESSAGE || proto.type == TYPE_GROUP)) {
    return EXPLICIT;
  }
  return resolved;
}
function isPackedField(proto, parent) {
  if (proto.label != LABEL_REPEATED) {
    return false;
  }
  switch (proto.type) {
    case TYPE_STRING:
    case TYPE_BYTES:
    case TYPE_GROUP:
    case TYPE_MESSAGE:
      return false;
  }
  const o = proto.options;
  if (o && unsafeIsSetExplicit(o, "packed")) {
    return o.packed;
  }
  return PACKED == resolveFeature("repeatedFieldEncoding", {
    proto,
    parent
  });
}
function findMapEntryFields(mapEntry) {
  const key = mapEntry.fields.find((f) => f.number === 1);
  const value = mapEntry.fields.find((f) => f.number === 2);
  assert(key && key.fieldKind == "scalar" && key.scalar != ScalarType.BYTES && key.scalar != ScalarType.FLOAT && key.scalar != ScalarType.DOUBLE && value && value.fieldKind != "list" && value.fieldKind != "map");
  return { key, value };
}
function isEnumOpen(desc) {
  var _a;
  return OPEN == resolveFeature("enumType", {
    proto: desc.proto,
    parent: (_a = desc.parent) !== null && _a !== void 0 ? _a : desc.file
  });
}
function isDelimitedEncoding(proto, parent) {
  if (proto.type == TYPE_GROUP) {
    return true;
  }
  return DELIMITED == resolveFeature("messageEncoding", {
    proto,
    parent
  });
}
function isUtf8Validated(proto, parent) {
  return VERIFY == resolveFeature("utf8Validation", {
    proto,
    parent
  });
}
function resolveFeature(name, ref) {
  var _a, _b;
  const featureSet = (_a = ref.proto.options) === null || _a === void 0 ? void 0 : _a.features;
  if (featureSet) {
    const val = featureSet[name];
    if (val != 0) {
      return val;
    }
  }
  if ("kind" in ref) {
    if (ref.kind == "message") {
      return resolveFeature(name, (_b = ref.parent) !== null && _b !== void 0 ? _b : ref.file);
    }
    const editionDefaults = featureDefaults[ref.edition];
    if (!editionDefaults) {
      throw new Error(`feature default for edition ${ref.edition} not found`);
    }
    return editionDefaults[name];
  }
  return resolveFeature(name, ref.parent);
}
function assert(condition, msg) {
  if (!condition) {
    throw new Error(msg);
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/boot.js
function boot(boot2) {
  const root = bootFileDescriptorProto(boot2);
  root.messageType.forEach(restoreJsonNames);
  const reg = createEmbeddedFileRegistry(root, () => void 0);
  return reg.getFile(root.name);
}
function bootFileDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    syntax: "",
    edition: 0
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FileDescriptorProto", dependency: [], publicDependency: [], weakDependency: [], optionDependency: [], service: [], extension: [] }, init), { messageType: init.messageType.map(bootDescriptorProto), enumType: init.enumType.map(bootEnumDescriptorProto) }));
}
function bootDescriptorProto(init) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const proto = /* @__PURE__ */ Object.create({
    visibility: 0
  });
  return Object.assign(proto, {
    $typeName: "google.protobuf.DescriptorProto",
    name: init.name,
    field: (_b = (_a = init.field) === null || _a === void 0 ? void 0 : _a.map(bootFieldDescriptorProto)) !== null && _b !== void 0 ? _b : [],
    extension: [],
    nestedType: (_d = (_c = init.nestedType) === null || _c === void 0 ? void 0 : _c.map(bootDescriptorProto)) !== null && _d !== void 0 ? _d : [],
    enumType: (_f = (_e = init.enumType) === null || _e === void 0 ? void 0 : _e.map(bootEnumDescriptorProto)) !== null && _f !== void 0 ? _f : [],
    extensionRange: (_h = (_g = init.extensionRange) === null || _g === void 0 ? void 0 : _g.map((e) => Object.assign({ $typeName: "google.protobuf.DescriptorProto.ExtensionRange" }, e))) !== null && _h !== void 0 ? _h : [],
    oneofDecl: [],
    reservedRange: [],
    reservedName: []
  });
}
function bootFieldDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    label: 1,
    typeName: "",
    extendee: "",
    defaultValue: "",
    oneofIndex: 0,
    jsonName: "",
    proto3Optional: false
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldDescriptorProto" }, init), { options: init.options ? bootFieldOptions(init.options) : void 0 }));
}
function bootFieldOptions(init) {
  var _a, _b, _c;
  const proto = /* @__PURE__ */ Object.create({
    ctype: 0,
    packed: false,
    jstype: 0,
    lazy: false,
    unverifiedLazy: false,
    deprecated: false,
    weak: false,
    debugRedact: false,
    retention: 0
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldOptions" }, init), { targets: (_a = init.targets) !== null && _a !== void 0 ? _a : [], editionDefaults: (_c = (_b = init.editionDefaults) === null || _b === void 0 ? void 0 : _b.map((e) => Object.assign({ $typeName: "google.protobuf.FieldOptions.EditionDefault" }, e))) !== null && _c !== void 0 ? _c : [], uninterpretedOption: [] }));
}
function bootEnumDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    visibility: 0
  });
  return Object.assign(proto, {
    $typeName: "google.protobuf.EnumDescriptorProto",
    name: init.name,
    reservedName: [],
    reservedRange: [],
    value: init.value.map((e) => Object.assign({ $typeName: "google.protobuf.EnumValueDescriptorProto" }, e))
  });
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/message.js
function messageDesc(file, path, ...paths) {
  return paths.reduce((acc, cur) => acc.nestedMessages[cur], file.messages[path]);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/wkt/google/protobuf/descriptor_pb.js
var file_google_protobuf_descriptor = /* @__PURE__ */ boot({ "name": "google/protobuf/descriptor.proto", "package": "google.protobuf", "messageType": [{ "name": "FileDescriptorSet", "field": [{ "name": "file", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FileDescriptorProto" }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "FileDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "package", "number": 2, "type": 9, "label": 1 }, { "name": "dependency", "number": 3, "type": 9, "label": 3 }, { "name": "public_dependency", "number": 10, "type": 5, "label": 3 }, { "name": "weak_dependency", "number": 11, "type": 5, "label": 3 }, { "name": "option_dependency", "number": 15, "type": 9, "label": 3 }, { "name": "message_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "service", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.ServiceDescriptorProto" }, { "name": "extension", "number": 7, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FileOptions" }, { "name": "source_code_info", "number": 9, "type": 11, "label": 1, "typeName": ".google.protobuf.SourceCodeInfo" }, { "name": "syntax", "number": 12, "type": 9, "label": 1 }, { "name": "edition", "number": 14, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }] }, { "name": "DescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "field", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "extension", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "nested_type", "number": 3, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "extension_range", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ExtensionRange" }, { "name": "oneof_decl", "number": 8, "type": 11, "label": 3, "typeName": ".google.protobuf.OneofDescriptorProto" }, { "name": "options", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.MessageOptions" }, { "name": "reserved_range", "number": 9, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ReservedRange" }, { "name": "reserved_name", "number": 10, "type": 9, "label": 3 }, { "name": "visibility", "number": 11, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "ExtensionRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions" }] }, { "name": "ReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "ExtensionRangeOptions", "field": [{ "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }, { "name": "declaration", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.ExtensionRangeOptions.Declaration", "options": { "retention": 2 } }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "verification", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions.VerificationState", "defaultValue": "UNVERIFIED", "options": { "retention": 2 } }], "nestedType": [{ "name": "Declaration", "field": [{ "name": "number", "number": 1, "type": 5, "label": 1 }, { "name": "full_name", "number": 2, "type": 9, "label": 1 }, { "name": "type", "number": 3, "type": 9, "label": 1 }, { "name": "reserved", "number": 5, "type": 8, "label": 1 }, { "name": "repeated", "number": 6, "type": 8, "label": 1 }] }], "enumType": [{ "name": "VerificationState", "value": [{ "name": "DECLARATION", "number": 0 }, { "name": "UNVERIFIED", "number": 1 }] }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "FieldDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 3, "type": 5, "label": 1 }, { "name": "label", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Label" }, { "name": "type", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Type" }, { "name": "type_name", "number": 6, "type": 9, "label": 1 }, { "name": "extendee", "number": 2, "type": 9, "label": 1 }, { "name": "default_value", "number": 7, "type": 9, "label": 1 }, { "name": "oneof_index", "number": 9, "type": 5, "label": 1 }, { "name": "json_name", "number": 10, "type": 9, "label": 1 }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions" }, { "name": "proto3_optional", "number": 17, "type": 8, "label": 1 }], "enumType": [{ "name": "Type", "value": [{ "name": "TYPE_DOUBLE", "number": 1 }, { "name": "TYPE_FLOAT", "number": 2 }, { "name": "TYPE_INT64", "number": 3 }, { "name": "TYPE_UINT64", "number": 4 }, { "name": "TYPE_INT32", "number": 5 }, { "name": "TYPE_FIXED64", "number": 6 }, { "name": "TYPE_FIXED32", "number": 7 }, { "name": "TYPE_BOOL", "number": 8 }, { "name": "TYPE_STRING", "number": 9 }, { "name": "TYPE_GROUP", "number": 10 }, { "name": "TYPE_MESSAGE", "number": 11 }, { "name": "TYPE_BYTES", "number": 12 }, { "name": "TYPE_UINT32", "number": 13 }, { "name": "TYPE_ENUM", "number": 14 }, { "name": "TYPE_SFIXED32", "number": 15 }, { "name": "TYPE_SFIXED64", "number": 16 }, { "name": "TYPE_SINT32", "number": 17 }, { "name": "TYPE_SINT64", "number": 18 }] }, { "name": "Label", "value": [{ "name": "LABEL_OPTIONAL", "number": 1 }, { "name": "LABEL_REPEATED", "number": 3 }, { "name": "LABEL_REQUIRED", "number": 2 }] }] }, { "name": "OneofDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "options", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.OneofOptions" }] }, { "name": "EnumDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "value", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumValueDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumOptions" }, { "name": "reserved_range", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto.EnumReservedRange" }, { "name": "reserved_name", "number": 5, "type": 9, "label": 3 }, { "name": "visibility", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "EnumReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "EnumValueDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumValueOptions" }] }, { "name": "ServiceDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "method", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.MethodDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ServiceOptions" }] }, { "name": "MethodDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "input_type", "number": 2, "type": 9, "label": 1 }, { "name": "output_type", "number": 3, "type": 9, "label": 1 }, { "name": "options", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.MethodOptions" }, { "name": "client_streaming", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "server_streaming", "number": 6, "type": 8, "label": 1, "defaultValue": "false" }] }, { "name": "FileOptions", "field": [{ "name": "java_package", "number": 1, "type": 9, "label": 1 }, { "name": "java_outer_classname", "number": 8, "type": 9, "label": 1 }, { "name": "java_multiple_files", "number": 10, "type": 8, "label": 1, "defaultValue": "false", "options": {} }, { "name": "java_generate_equals_and_hash", "number": 20, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "java_string_check_utf8", "number": 27, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "optimize_for", "number": 9, "type": 14, "label": 1, "typeName": ".google.protobuf.FileOptions.OptimizeMode", "defaultValue": "SPEED" }, { "name": "go_package", "number": 11, "type": 9, "label": 1 }, { "name": "cc_generic_services", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "java_generic_services", "number": 17, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "py_generic_services", "number": 18, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 23, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "cc_enable_arenas", "number": 31, "type": 8, "label": 1, "defaultValue": "true", "options": {} }, { "name": "objc_class_prefix", "number": 36, "type": 9, "label": 1 }, { "name": "csharp_namespace", "number": 37, "type": 9, "label": 1 }, { "name": "swift_prefix", "number": 39, "type": 9, "label": 1 }, { "name": "php_class_prefix", "number": 40, "type": 9, "label": 1 }, { "name": "php_namespace", "number": 41, "type": 9, "label": 1 }, { "name": "php_metadata_namespace", "number": 44, "type": 9, "label": 1 }, { "name": "ruby_package", "number": 45, "type": 9, "label": 1 }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "OptimizeMode", "value": [{ "name": "SPEED", "number": 1 }, { "name": "CODE_SIZE", "number": 2 }, { "name": "LITE_RUNTIME", "number": 3 }] }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "MessageOptions", "field": [{ "name": "message_set_wire_format", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "no_standard_descriptor_accessor", "number": 2, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "map_entry", "number": 7, "type": 8, "label": 1 }, { "name": "deprecated_legacy_json_field_conflicts", "number": 11, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 12, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "FieldOptions", "field": [{ "name": "ctype", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.CType", "defaultValue": "STRING" }, { "name": "packed", "number": 2, "type": 8, "label": 1 }, { "name": "jstype", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.JSType", "defaultValue": "JS_NORMAL" }, { "name": "lazy", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "unverified_lazy", "number": 15, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "weak", "number": 10, "type": 8, "label": 1, "defaultValue": "false", "options": { "deprecated": true } }, { "name": "debug_redact", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "retention", "number": 17, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.OptionRetention" }, { "name": "targets", "number": 19, "type": 14, "label": 3, "typeName": ".google.protobuf.FieldOptions.OptionTargetType" }, { "name": "edition_defaults", "number": 20, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldOptions.EditionDefault" }, { "name": "features", "number": 21, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "feature_support", "number": 22, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "nestedType": [{ "name": "EditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "value", "number": 2, "type": 9, "label": 1 }] }, { "name": "FeatureSupport", "field": [{ "name": "edition_introduced", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "edition_deprecated", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "deprecation_warning", "number": 3, "type": 9, "label": 1 }, { "name": "edition_removed", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "removal_error", "number": 5, "type": 9, "label": 1 }] }], "enumType": [{ "name": "CType", "value": [{ "name": "STRING", "number": 0 }, { "name": "CORD", "number": 1 }, { "name": "STRING_PIECE", "number": 2 }] }, { "name": "JSType", "value": [{ "name": "JS_NORMAL", "number": 0 }, { "name": "JS_STRING", "number": 1 }, { "name": "JS_NUMBER", "number": 2 }] }, { "name": "OptionRetention", "value": [{ "name": "RETENTION_UNKNOWN", "number": 0 }, { "name": "RETENTION_RUNTIME", "number": 1 }, { "name": "RETENTION_SOURCE", "number": 2 }] }, { "name": "OptionTargetType", "value": [{ "name": "TARGET_TYPE_UNKNOWN", "number": 0 }, { "name": "TARGET_TYPE_FILE", "number": 1 }, { "name": "TARGET_TYPE_EXTENSION_RANGE", "number": 2 }, { "name": "TARGET_TYPE_MESSAGE", "number": 3 }, { "name": "TARGET_TYPE_FIELD", "number": 4 }, { "name": "TARGET_TYPE_ONEOF", "number": 5 }, { "name": "TARGET_TYPE_ENUM", "number": 6 }, { "name": "TARGET_TYPE_ENUM_ENTRY", "number": 7 }, { "name": "TARGET_TYPE_SERVICE", "number": 8 }, { "name": "TARGET_TYPE_METHOD", "number": 9 }] }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "OneofOptions", "field": [{ "name": "features", "number": 1, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "EnumOptions", "field": [{ "name": "allow_alias", "number": 2, "type": 8, "label": 1 }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated_legacy_json_field_conflicts", "number": 6, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "EnumValueOptions", "field": [{ "name": "deprecated", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "features", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "debug_redact", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "feature_support", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "ServiceOptions", "field": [{ "name": "features", "number": 34, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "MethodOptions", "field": [{ "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "idempotency_level", "number": 34, "type": 14, "label": 1, "typeName": ".google.protobuf.MethodOptions.IdempotencyLevel", "defaultValue": "IDEMPOTENCY_UNKNOWN" }, { "name": "features", "number": 35, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "IdempotencyLevel", "value": [{ "name": "IDEMPOTENCY_UNKNOWN", "number": 0 }, { "name": "NO_SIDE_EFFECTS", "number": 1 }, { "name": "IDEMPOTENT", "number": 2 }] }], "extensionRange": [{ "start": 990, "end": 999 }, { "start": 1e3, "end": 536870912 }] }, { "name": "UninterpretedOption", "field": [{ "name": "name", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption.NamePart" }, { "name": "identifier_value", "number": 3, "type": 9, "label": 1 }, { "name": "positive_int_value", "number": 4, "type": 4, "label": 1 }, { "name": "negative_int_value", "number": 5, "type": 3, "label": 1 }, { "name": "double_value", "number": 6, "type": 1, "label": 1 }, { "name": "string_value", "number": 7, "type": 12, "label": 1 }, { "name": "aggregate_value", "number": 8, "type": 9, "label": 1 }], "nestedType": [{ "name": "NamePart", "field": [{ "name": "name_part", "number": 1, "type": 9, "label": 2 }, { "name": "is_extension", "number": 2, "type": 8, "label": 2 }] }] }, { "name": "FeatureSet", "field": [{ "name": "field_presence", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.FieldPresence", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPLICIT", "edition": 900 }, { "value": "IMPLICIT", "edition": 999 }, { "value": "EXPLICIT", "edition": 1e3 }] } }, { "name": "enum_type", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnumType", "options": { "retention": 1, "targets": [6, 1], "editionDefaults": [{ "value": "CLOSED", "edition": 900 }, { "value": "OPEN", "edition": 999 }] } }, { "name": "repeated_field_encoding", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.RepeatedFieldEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPANDED", "edition": 900 }, { "value": "PACKED", "edition": 999 }] } }, { "name": "utf8_validation", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.Utf8Validation", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "NONE", "edition": 900 }, { "value": "VERIFY", "edition": 999 }] } }, { "name": "message_encoding", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.MessageEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "LENGTH_PREFIXED", "edition": 900 }] } }, { "name": "json_format", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.JsonFormat", "options": { "retention": 1, "targets": [3, 6, 1], "editionDefaults": [{ "value": "LEGACY_BEST_EFFORT", "edition": 900 }, { "value": "ALLOW", "edition": 999 }] } }, { "name": "enforce_naming_style", "number": 7, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnforceNamingStyle", "options": { "retention": 2, "targets": [1, 2, 3, 4, 5, 6, 7, 8, 9], "editionDefaults": [{ "value": "STYLE_LEGACY", "edition": 900 }, { "value": "STYLE2024", "edition": 1001 }, { "value": "STYLE2026", "edition": 1002 }] } }, { "name": "default_symbol_visibility", "number": 8, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.VisibilityFeature.DefaultSymbolVisibility", "options": { "retention": 2, "targets": [1], "editionDefaults": [{ "value": "EXPORT_ALL", "edition": 900 }, { "value": "EXPORT_TOP_LEVEL", "edition": 1001 }, { "value": "STRICT", "edition": 1002 }] } }, { "name": "enforce_proto_limits", "number": 9, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.ProtoLimitsFeature.EnforceProtoLimits", "options": { "retention": 2, "targets": [6, 3, 4, 5], "editionDefaults": [{ "value": "LEGACY_NO_EXPLICIT_LIMITS", "edition": 900 }, { "value": "PROTO_LIMITS2026", "edition": 1002 }] } }], "nestedType": [{ "name": "VisibilityFeature", "enumType": [{ "name": "DefaultSymbolVisibility", "value": [{ "name": "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN", "number": 0 }, { "name": "EXPORT_ALL", "number": 1 }, { "name": "EXPORT_TOP_LEVEL", "number": 2 }, { "name": "LOCAL_ALL", "number": 3 }, { "name": "STRICT", "number": 4 }] }] }, { "name": "ProtoLimitsFeature", "enumType": [{ "name": "EnforceProtoLimits", "value": [{ "name": "PROTO_LIMITS_UNKNOWN", "number": 0 }, { "name": "LEGACY_NO_EXPLICIT_LIMITS", "number": 1 }, { "name": "PROTO_LIMITS2026", "number": 2 }] }] }], "enumType": [{ "name": "FieldPresence", "value": [{ "name": "FIELD_PRESENCE_UNKNOWN", "number": 0 }, { "name": "EXPLICIT", "number": 1 }, { "name": "IMPLICIT", "number": 2 }, { "name": "LEGACY_REQUIRED", "number": 3 }] }, { "name": "EnumType", "value": [{ "name": "ENUM_TYPE_UNKNOWN", "number": 0 }, { "name": "OPEN", "number": 1 }, { "name": "CLOSED", "number": 2 }] }, { "name": "RepeatedFieldEncoding", "value": [{ "name": "REPEATED_FIELD_ENCODING_UNKNOWN", "number": 0 }, { "name": "PACKED", "number": 1 }, { "name": "EXPANDED", "number": 2 }] }, { "name": "Utf8Validation", "value": [{ "name": "UTF8_VALIDATION_UNKNOWN", "number": 0 }, { "name": "VERIFY", "number": 2 }, { "name": "NONE", "number": 3 }] }, { "name": "MessageEncoding", "value": [{ "name": "MESSAGE_ENCODING_UNKNOWN", "number": 0 }, { "name": "LENGTH_PREFIXED", "number": 1 }, { "name": "DELIMITED", "number": 2 }] }, { "name": "JsonFormat", "value": [{ "name": "JSON_FORMAT_UNKNOWN", "number": 0 }, { "name": "ALLOW", "number": 1 }, { "name": "LEGACY_BEST_EFFORT", "number": 2 }] }, { "name": "EnforceNamingStyle", "value": [{ "name": "ENFORCE_NAMING_STYLE_UNKNOWN", "number": 0 }, { "name": "STYLE2024", "number": 1 }, { "name": "STYLE_LEGACY", "number": 2 }, { "name": "STYLE2026", "number": 3 }] }], "extensionRange": [{ "start": 1e3, "end": 9995 }, { "start": 9995, "end": 1e4 }, { "start": 1e4, "end": 10001 }] }, { "name": "FeatureSetDefaults", "field": [{ "name": "defaults", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault" }, { "name": "minimum_edition", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "maximum_edition", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }], "nestedType": [{ "name": "FeatureSetEditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "overridable_features", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "fixed_features", "number": 5, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }] }] }, { "name": "SourceCodeInfo", "field": [{ "name": "location", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.SourceCodeInfo.Location" }], "nestedType": [{ "name": "Location", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "span", "number": 2, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "leading_comments", "number": 3, "type": 9, "label": 1 }, { "name": "trailing_comments", "number": 4, "type": 9, "label": 1 }, { "name": "leading_detached_comments", "number": 6, "type": 9, "label": 3 }] }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "GeneratedCodeInfo", "field": [{ "name": "annotation", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation" }], "nestedType": [{ "name": "Annotation", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "source_file", "number": 2, "type": 9, "label": 1 }, { "name": "begin", "number": 3, "type": 5, "label": 1 }, { "name": "end", "number": 4, "type": 5, "label": 1 }, { "name": "semantic", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation.Semantic" }], "enumType": [{ "name": "Semantic", "value": [{ "name": "NONE", "number": 0 }, { "name": "SET", "number": 1 }, { "name": "ALIAS", "number": 2 }] }] }] }], "enumType": [{ "name": "Edition", "value": [{ "name": "EDITION_UNKNOWN", "number": 0 }, { "name": "EDITION_LEGACY", "number": 900 }, { "name": "EDITION_PROTO2", "number": 998 }, { "name": "EDITION_PROTO3", "number": 999 }, { "name": "EDITION_2023", "number": 1e3 }, { "name": "EDITION_2024", "number": 1001 }, { "name": "EDITION_2026", "number": 1002 }, { "name": "EDITION_UNSTABLE", "number": 9999 }, { "name": "EDITION_1_TEST_ONLY", "number": 1 }, { "name": "EDITION_2_TEST_ONLY", "number": 2 }, { "name": "EDITION_99997_TEST_ONLY", "number": 99997 }, { "name": "EDITION_99998_TEST_ONLY", "number": 99998 }, { "name": "EDITION_99999_TEST_ONLY", "number": 99999 }, { "name": "EDITION_MAX", "number": 2147483647 }] }, { "name": "SymbolVisibility", "value": [{ "name": "VISIBILITY_UNSET", "number": 0 }, { "name": "VISIBILITY_LOCAL", "number": 1 }, { "name": "VISIBILITY_EXPORT", "number": 2 }] }] });
var FileDescriptorProtoSchema = /* @__PURE__ */ messageDesc(file_google_protobuf_descriptor, 1);
var ExtensionRangeOptions_VerificationState;
(function(ExtensionRangeOptions_VerificationState2) {
  ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["DECLARATION"] = 0] = "DECLARATION";
  ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["UNVERIFIED"] = 1] = "UNVERIFIED";
})(ExtensionRangeOptions_VerificationState || (ExtensionRangeOptions_VerificationState = {}));
var FieldDescriptorProto_Type;
(function(FieldDescriptorProto_Type2) {
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["DOUBLE"] = 1] = "DOUBLE";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FLOAT"] = 2] = "FLOAT";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT64"] = 3] = "INT64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT64"] = 4] = "UINT64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT32"] = 5] = "INT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED64"] = 6] = "FIXED64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED32"] = 7] = "FIXED32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BOOL"] = 8] = "BOOL";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["STRING"] = 9] = "STRING";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["GROUP"] = 10] = "GROUP";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["MESSAGE"] = 11] = "MESSAGE";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BYTES"] = 12] = "BYTES";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT32"] = 13] = "UINT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["ENUM"] = 14] = "ENUM";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED32"] = 15] = "SFIXED32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED64"] = 16] = "SFIXED64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT32"] = 17] = "SINT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT64"] = 18] = "SINT64";
})(FieldDescriptorProto_Type || (FieldDescriptorProto_Type = {}));
var FieldDescriptorProto_Label;
(function(FieldDescriptorProto_Label2) {
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["OPTIONAL"] = 1] = "OPTIONAL";
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REPEATED"] = 3] = "REPEATED";
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REQUIRED"] = 2] = "REQUIRED";
})(FieldDescriptorProto_Label || (FieldDescriptorProto_Label = {}));
var FileOptions_OptimizeMode;
(function(FileOptions_OptimizeMode2) {
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["SPEED"] = 1] = "SPEED";
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["CODE_SIZE"] = 2] = "CODE_SIZE";
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["LITE_RUNTIME"] = 3] = "LITE_RUNTIME";
})(FileOptions_OptimizeMode || (FileOptions_OptimizeMode = {}));
var FieldOptions_CType;
(function(FieldOptions_CType2) {
  FieldOptions_CType2[FieldOptions_CType2["STRING"] = 0] = "STRING";
  FieldOptions_CType2[FieldOptions_CType2["CORD"] = 1] = "CORD";
  FieldOptions_CType2[FieldOptions_CType2["STRING_PIECE"] = 2] = "STRING_PIECE";
})(FieldOptions_CType || (FieldOptions_CType = {}));
var FieldOptions_JSType;
(function(FieldOptions_JSType2) {
  FieldOptions_JSType2[FieldOptions_JSType2["JS_NORMAL"] = 0] = "JS_NORMAL";
  FieldOptions_JSType2[FieldOptions_JSType2["JS_STRING"] = 1] = "JS_STRING";
  FieldOptions_JSType2[FieldOptions_JSType2["JS_NUMBER"] = 2] = "JS_NUMBER";
})(FieldOptions_JSType || (FieldOptions_JSType = {}));
var FieldOptions_OptionRetention;
(function(FieldOptions_OptionRetention2) {
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_UNKNOWN"] = 0] = "RETENTION_UNKNOWN";
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_RUNTIME"] = 1] = "RETENTION_RUNTIME";
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_SOURCE"] = 2] = "RETENTION_SOURCE";
})(FieldOptions_OptionRetention || (FieldOptions_OptionRetention = {}));
var FieldOptions_OptionTargetType;
(function(FieldOptions_OptionTargetType2) {
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_UNKNOWN"] = 0] = "TARGET_TYPE_UNKNOWN";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FILE"] = 1] = "TARGET_TYPE_FILE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_EXTENSION_RANGE"] = 2] = "TARGET_TYPE_EXTENSION_RANGE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_MESSAGE"] = 3] = "TARGET_TYPE_MESSAGE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FIELD"] = 4] = "TARGET_TYPE_FIELD";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ONEOF"] = 5] = "TARGET_TYPE_ONEOF";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM"] = 6] = "TARGET_TYPE_ENUM";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM_ENTRY"] = 7] = "TARGET_TYPE_ENUM_ENTRY";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_SERVICE"] = 8] = "TARGET_TYPE_SERVICE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_METHOD"] = 9] = "TARGET_TYPE_METHOD";
})(FieldOptions_OptionTargetType || (FieldOptions_OptionTargetType = {}));
var MethodOptions_IdempotencyLevel;
(function(MethodOptions_IdempotencyLevel2) {
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENCY_UNKNOWN"] = 0] = "IDEMPOTENCY_UNKNOWN";
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["NO_SIDE_EFFECTS"] = 1] = "NO_SIDE_EFFECTS";
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENT"] = 2] = "IDEMPOTENT";
})(MethodOptions_IdempotencyLevel || (MethodOptions_IdempotencyLevel = {}));
var FeatureSet_VisibilityFeature_DefaultSymbolVisibility;
(function(FeatureSet_VisibilityFeature_DefaultSymbolVisibility2) {
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["DEFAULT_SYMBOL_VISIBILITY_UNKNOWN"] = 0] = "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_ALL"] = 1] = "EXPORT_ALL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_TOP_LEVEL"] = 2] = "EXPORT_TOP_LEVEL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["LOCAL_ALL"] = 3] = "LOCAL_ALL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["STRICT"] = 4] = "STRICT";
})(FeatureSet_VisibilityFeature_DefaultSymbolVisibility || (FeatureSet_VisibilityFeature_DefaultSymbolVisibility = {}));
var FeatureSet_ProtoLimitsFeature_EnforceProtoLimits;
(function(FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2) {
  FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2[FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2["PROTO_LIMITS_UNKNOWN"] = 0] = "PROTO_LIMITS_UNKNOWN";
  FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2[FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2["LEGACY_NO_EXPLICIT_LIMITS"] = 1] = "LEGACY_NO_EXPLICIT_LIMITS";
  FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2[FeatureSet_ProtoLimitsFeature_EnforceProtoLimits2["PROTO_LIMITS2026"] = 2] = "PROTO_LIMITS2026";
})(FeatureSet_ProtoLimitsFeature_EnforceProtoLimits || (FeatureSet_ProtoLimitsFeature_EnforceProtoLimits = {}));
var FeatureSet_FieldPresence;
(function(FeatureSet_FieldPresence2) {
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["FIELD_PRESENCE_UNKNOWN"] = 0] = "FIELD_PRESENCE_UNKNOWN";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["EXPLICIT"] = 1] = "EXPLICIT";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["IMPLICIT"] = 2] = "IMPLICIT";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["LEGACY_REQUIRED"] = 3] = "LEGACY_REQUIRED";
})(FeatureSet_FieldPresence || (FeatureSet_FieldPresence = {}));
var FeatureSet_EnumType;
(function(FeatureSet_EnumType2) {
  FeatureSet_EnumType2[FeatureSet_EnumType2["ENUM_TYPE_UNKNOWN"] = 0] = "ENUM_TYPE_UNKNOWN";
  FeatureSet_EnumType2[FeatureSet_EnumType2["OPEN"] = 1] = "OPEN";
  FeatureSet_EnumType2[FeatureSet_EnumType2["CLOSED"] = 2] = "CLOSED";
})(FeatureSet_EnumType || (FeatureSet_EnumType = {}));
var FeatureSet_RepeatedFieldEncoding;
(function(FeatureSet_RepeatedFieldEncoding2) {
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["REPEATED_FIELD_ENCODING_UNKNOWN"] = 0] = "REPEATED_FIELD_ENCODING_UNKNOWN";
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["PACKED"] = 1] = "PACKED";
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["EXPANDED"] = 2] = "EXPANDED";
})(FeatureSet_RepeatedFieldEncoding || (FeatureSet_RepeatedFieldEncoding = {}));
var FeatureSet_Utf8Validation;
(function(FeatureSet_Utf8Validation2) {
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["UTF8_VALIDATION_UNKNOWN"] = 0] = "UTF8_VALIDATION_UNKNOWN";
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["VERIFY"] = 2] = "VERIFY";
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["NONE"] = 3] = "NONE";
})(FeatureSet_Utf8Validation || (FeatureSet_Utf8Validation = {}));
var FeatureSet_MessageEncoding;
(function(FeatureSet_MessageEncoding2) {
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["MESSAGE_ENCODING_UNKNOWN"] = 0] = "MESSAGE_ENCODING_UNKNOWN";
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["LENGTH_PREFIXED"] = 1] = "LENGTH_PREFIXED";
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["DELIMITED"] = 2] = "DELIMITED";
})(FeatureSet_MessageEncoding || (FeatureSet_MessageEncoding = {}));
var FeatureSet_JsonFormat;
(function(FeatureSet_JsonFormat2) {
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["JSON_FORMAT_UNKNOWN"] = 0] = "JSON_FORMAT_UNKNOWN";
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["ALLOW"] = 1] = "ALLOW";
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["LEGACY_BEST_EFFORT"] = 2] = "LEGACY_BEST_EFFORT";
})(FeatureSet_JsonFormat || (FeatureSet_JsonFormat = {}));
var FeatureSet_EnforceNamingStyle;
(function(FeatureSet_EnforceNamingStyle2) {
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["ENFORCE_NAMING_STYLE_UNKNOWN"] = 0] = "ENFORCE_NAMING_STYLE_UNKNOWN";
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE2024"] = 1] = "STYLE2024";
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE_LEGACY"] = 2] = "STYLE_LEGACY";
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE2026"] = 3] = "STYLE2026";
})(FeatureSet_EnforceNamingStyle || (FeatureSet_EnforceNamingStyle = {}));
var GeneratedCodeInfo_Annotation_Semantic;
(function(GeneratedCodeInfo_Annotation_Semantic2) {
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["NONE"] = 0] = "NONE";
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["SET"] = 1] = "SET";
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["ALIAS"] = 2] = "ALIAS";
})(GeneratedCodeInfo_Annotation_Semantic || (GeneratedCodeInfo_Annotation_Semantic = {}));
var Edition;
(function(Edition2) {
  Edition2[Edition2["EDITION_UNKNOWN"] = 0] = "EDITION_UNKNOWN";
  Edition2[Edition2["EDITION_LEGACY"] = 900] = "EDITION_LEGACY";
  Edition2[Edition2["EDITION_PROTO2"] = 998] = "EDITION_PROTO2";
  Edition2[Edition2["EDITION_PROTO3"] = 999] = "EDITION_PROTO3";
  Edition2[Edition2["EDITION_2023"] = 1e3] = "EDITION_2023";
  Edition2[Edition2["EDITION_2024"] = 1001] = "EDITION_2024";
  Edition2[Edition2["EDITION_2026"] = 1002] = "EDITION_2026";
  Edition2[Edition2["EDITION_UNSTABLE"] = 9999] = "EDITION_UNSTABLE";
  Edition2[Edition2["EDITION_1_TEST_ONLY"] = 1] = "EDITION_1_TEST_ONLY";
  Edition2[Edition2["EDITION_2_TEST_ONLY"] = 2] = "EDITION_2_TEST_ONLY";
  Edition2[Edition2["EDITION_99997_TEST_ONLY"] = 99997] = "EDITION_99997_TEST_ONLY";
  Edition2[Edition2["EDITION_99998_TEST_ONLY"] = 99998] = "EDITION_99998_TEST_ONLY";
  Edition2[Edition2["EDITION_99999_TEST_ONLY"] = 99999] = "EDITION_99999_TEST_ONLY";
  Edition2[Edition2["EDITION_MAX"] = 2147483647] = "EDITION_MAX";
})(Edition || (Edition = {}));
var SymbolVisibility;
(function(SymbolVisibility2) {
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_UNSET"] = 0] = "VISIBILITY_UNSET";
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_LOCAL"] = 1] = "VISIBILITY_LOCAL";
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_EXPORT"] = 2] = "VISIBILITY_EXPORT";
})(SymbolVisibility || (SymbolVisibility = {}));

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/from-binary.js
function makeReadContext(options) {
  return Object.assign(Object.assign({ readUnknownFields: true, recursionLimit: 100 }, options), { depth: 0 });
}
function fromBinary(schema, bytes, options) {
  const message = create(schema);
  compiledReader(schema).read(message, new BinaryReader(bytes), makeReadContext(options), bytes.byteLength);
  return message;
}
var compiledReaders = /* @__PURE__ */ new WeakMap();
function compiledReader(desc) {
  let compiled = compiledReaders.get(desc);
  if (compiled === void 0) {
    compiled = compileMessage(desc);
  }
  return compiled;
}
function compileMessage(desc) {
  const descString = String(desc);
  const fieldReaders = /* @__PURE__ */ new Map();
  const compiled = {
    read: compileMessageReader(descString, fieldReaders),
    readGroup: compileGroupReader(descString, fieldReaders)
  };
  compiledReaders.set(desc, compiled);
  for (const field of desc.fields) {
    fieldReaders.set(field.number, compileFieldReader(field));
  }
  return compiled;
}
function compileMessageReader(descString, fieldReaders) {
  return (message, reader, ctx, length) => {
    var _a;
    if (++ctx.depth > ctx.recursionLimit) {
      throw new Error(`cannot decode ${descString} from binary: maximum recursion depth of ${ctx.recursionLimit} reached`);
    }
    const end = reader.pos + length;
    const unknownFields = (_a = message.$unknown) !== null && _a !== void 0 ? _a : [];
    while (reader.pos < end) {
      const [fieldNo, wireType] = reader.tag();
      const fieldReader = fieldReaders.get(fieldNo);
      if (fieldReader === void 0) {
        const data = reader.skip(wireType, fieldNo, ctx.recursionLimit - ctx.depth);
        if (ctx.readUnknownFields) {
          unknownFields.push({ no: fieldNo, wireType, data });
        }
        continue;
      }
      fieldReader(message, reader, ctx, wireType);
    }
    if (unknownFields.length > 0) {
      message.$unknown = unknownFields;
    }
    ctx.depth--;
  };
}
function compileGroupReader(descString, fieldReaders) {
  return (message, reader, ctx, fieldNo) => {
    var _a;
    if (++ctx.depth > ctx.recursionLimit) {
      throw new Error(`cannot decode ${descString} from binary: maximum recursion depth of ${ctx.recursionLimit} reached`);
    }
    let recordFieldNo;
    let wireType;
    const unknownFields = (_a = message.$unknown) !== null && _a !== void 0 ? _a : [];
    while (reader.pos < reader.len) {
      [recordFieldNo, wireType] = reader.tag();
      if (wireType == WireType.EndGroup) {
        break;
      }
      const fieldReader = fieldReaders.get(recordFieldNo);
      if (fieldReader === void 0) {
        const data = reader.skip(wireType, recordFieldNo, ctx.recursionLimit - ctx.depth);
        if (ctx.readUnknownFields) {
          unknownFields.push({ no: recordFieldNo, wireType, data });
        }
        continue;
      }
      fieldReader(message, reader, ctx, wireType);
    }
    if (wireType != WireType.EndGroup || recordFieldNo !== fieldNo) {
      throw new Error("invalid end group tag");
    }
    if (unknownFields.length > 0) {
      message.$unknown = unknownFields;
    }
    ctx.depth--;
  };
}
function compileFieldReader(field) {
  switch (field.fieldKind) {
    case "scalar":
      return compileScalarFieldReader(field);
    case "enum":
      return compileEnumFieldReader(field);
    case "message":
      return compileMessageFieldReader(field);
    case "list":
      return compileListFieldReader(field);
    case "map":
      return compileMapFieldReader(field);
  }
}
function compileScalarFieldReader(field) {
  const readScalar = compileScalarReader(field.scalar, field.utf8Validation, field.longAsString);
  const localName = field.localName;
  if (field.oneof) {
    const oneofLocalName = field.oneof.localName;
    return (message, reader) => {
      message[oneofLocalName] = {
        case: localName,
        value: readScalar(reader)
      };
    };
  }
  return (message, reader) => {
    message[localName] = readScalar(reader);
  };
}
function compileEnumFieldReader(field) {
  var _a;
  const localName = field.localName;
  const oneofLocalName = (_a = field.oneof) === null || _a === void 0 ? void 0 : _a.localName;
  if (field.enum.open) {
    if (oneofLocalName !== void 0) {
      return (message, reader) => {
        message[oneofLocalName] = { case: localName, value: reader.int32() };
      };
    }
    return (message, reader) => {
      message[localName] = reader.int32();
    };
  }
  const values = field.enum.values;
  const fieldNo = field.number;
  return (message, reader, ctx, wireType) => {
    var _a2;
    const val = reader.int32();
    if (values.some((v) => v.number === val)) {
      if (oneofLocalName !== void 0) {
        message[oneofLocalName] = { case: localName, value: val };
      } else {
        message[localName] = val;
      }
    } else if (ctx.readUnknownFields) {
      const bytes = [];
      varint32write(val, bytes);
      const unknownFields = (_a2 = message.$unknown) !== null && _a2 !== void 0 ? _a2 : [];
      unknownFields.push({
        no: fieldNo,
        wireType,
        data: new Uint8Array(bytes)
      });
      message.$unknown = unknownFields;
    }
  };
}
function compileMessageFieldReader(field) {
  const localName = field.localName;
  const { toMessage, toLocal } = localMessageMapper(field);
  const readChild = compileChildReader(field);
  if (field.oneof) {
    const oneofLocalName = field.oneof.localName;
    return (message, reader, ctx) => {
      const oneof = message[oneofLocalName];
      const child = toMessage(oneof.case === localName ? oneof.value : void 0);
      readChild(child, reader, ctx);
      message[oneofLocalName] = { case: localName, value: toLocal(child) };
    };
  }
  return (message, reader, ctx) => {
    const child = toMessage(message[localName]);
    readChild(child, reader, ctx);
    message[localName] = toLocal(child);
  };
}
function compileChildReader(field) {
  const compiledChild = compiledReader(field.message);
  if (field.delimitedEncoding) {
    const fieldNo = field.number;
    return (child, reader, ctx) => compiledChild.readGroup(child, reader, ctx, fieldNo);
  }
  return (child, reader, ctx) => compiledChild.read(child, reader, ctx, reader.uint32());
}
function compileListFieldReader(field) {
  const localName = field.localName;
  if (field.listKind == "message") {
    const { toMessage, toLocal } = localMessageMapper(field);
    const readChild = compileChildReader(field);
    return (message, reader, ctx) => {
      const child = toMessage(void 0);
      readChild(child, reader, ctx);
      message[localName].push(toLocal(child));
    };
  }
  const scalarType = field.listKind == "enum" ? ScalarType.INT32 : field.scalar;
  const longAsString = field.listKind == "scalar" ? field.longAsString : false;
  const readScalar = compileScalarReader(scalarType, field.utf8Validation, longAsString);
  const packedPossible = scalarType != ScalarType.STRING && scalarType != ScalarType.BYTES;
  return (message, reader, ctx, wireType) => {
    const items = message[localName];
    if (wireType == WireType.LengthDelimited && packedPossible) {
      const end = reader.uint32() + reader.pos;
      while (reader.pos < end) {
        items.push(readScalar(reader));
      }
    } else {
      items.push(readScalar(reader));
    }
  };
}
function compileMapFieldReader(field) {
  const localName = field.localName;
  const readKey = compileScalarReader(field.mapKey, field.utf8Validation, false);
  const keyZero = scalarZeroValue(field.mapKey, false);
  let readValue;
  let valueDefault;
  switch (field.mapKind) {
    case "scalar": {
      const scalar = field.scalar;
      const readScalar = compileScalarReader(scalar, field.utf8Validation, false);
      readValue = (reader) => readScalar(reader);
      if (scalar == ScalarType.BYTES) {
        valueDefault = () => new Uint8Array(0);
      } else {
        const zero = scalarZeroValue(scalar, false);
        valueDefault = () => zero;
      }
      break;
    }
    case "enum": {
      const zero = field.enum.values[0].number;
      readValue = (reader) => reader.int32();
      valueDefault = () => zero;
      break;
    }
    case "message": {
      const { toMessage, toLocal } = localMessageMapper(field);
      const readChild = compiledReader(field.message).read;
      readValue = (reader, ctx, existing) => {
        const child = toMessage(existing);
        readChild(child, reader, ctx, reader.uint32());
        return toLocal(child);
      };
      valueDefault = () => toLocal(toMessage(void 0));
      break;
    }
  }
  return (message, reader, ctx) => {
    const record = message[localName];
    let key;
    let val;
    const len = reader.uint32();
    const end = reader.pos + len;
    while (reader.pos < end) {
      const [fieldNo, wireType] = reader.tag();
      switch (fieldNo) {
        case 1:
          key = readKey(reader);
          break;
        case 2:
          val = readValue(reader, ctx, val);
          break;
        default:
          reader.skip(wireType, fieldNo, ctx.recursionLimit - ctx.depth);
      }
    }
    if (key === void 0) {
      key = keyZero;
    }
    if (val === void 0) {
      val = valueDefault();
    }
    setOwn(record, key, val);
  };
}
function compileScalarReader(type, utf8Validation, longAsString) {
  switch (type) {
    case ScalarType.STRING:
      return (reader) => reader.string(utf8Validation);
    case ScalarType.BOOL:
      return (reader) => reader.bool();
    case ScalarType.DOUBLE:
      return (reader) => reader.double();
    case ScalarType.FLOAT:
      return (reader) => reader.float();
    case ScalarType.INT32:
      return (reader) => reader.int32();
    case ScalarType.INT64:
      if (longAsString) {
        return (reader) => String(reader.int64());
      }
      return (reader) => reader.int64();
    case ScalarType.UINT64:
      if (longAsString) {
        return (reader) => String(reader.uint64());
      }
      return (reader) => reader.uint64();
    case ScalarType.FIXED64:
      if (longAsString) {
        return (reader) => String(reader.fixed64());
      }
      return (reader) => reader.fixed64();
    case ScalarType.BYTES:
      return (reader) => reader.bytes();
    case ScalarType.FIXED32:
      return (reader) => reader.fixed32();
    case ScalarType.SFIXED32:
      return (reader) => reader.sfixed32();
    case ScalarType.SFIXED64:
      if (longAsString) {
        return (reader) => String(reader.sfixed64());
      }
      return (reader) => reader.sfixed64();
    case ScalarType.SINT64:
      if (longAsString) {
        return (reader) => String(reader.sint64());
      }
      return (reader) => reader.sint64();
    case ScalarType.UINT32:
      return (reader) => reader.uint32();
    case ScalarType.SINT32:
      return (reader) => reader.sint32();
  }
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/file.js
function fileDesc(b64, imports) {
  var _a;
  const root = fromBinary(FileDescriptorProtoSchema, base64Decode(b64));
  root.messageType.forEach(restoreJsonNames);
  root.dependency = (_a = imports === null || imports === void 0 ? void 0 : imports.map((f) => f.proto.name)) !== null && _a !== void 0 ? _a : [];
  const reg = createEmbeddedFileRegistry(root, (protoFileName) => imports === null || imports === void 0 ? void 0 : imports.find((f) => f.proto.name === protoFileName));
  return reg.getFile(root.name);
}

// .sites-runtime/cpsat-js/node_modules/@bufbuild/protobuf/dist/esm/to-binary.js
var IMPLICIT3 = 2;
var LEGACY_REQUIRED2 = 3;
var writeDefaults = {
  writeUnknownFields: true
};
function makeWriteOptions(options) {
  return options ? Object.assign(Object.assign({}, writeDefaults), options) : writeDefaults;
}
function toBinary(schema, message, options) {
  const writer = new BinaryWriter();
  compiledWriter(schema)(writer, makeWriteOptions(options), message);
  return writer.finish();
}
var compiledWriters = /* @__PURE__ */ new WeakMap();
function compiledWriter(desc) {
  let compiled = compiledWriters.get(desc);
  if (compiled === void 0) {
    compiled = compileMessage2(desc);
  }
  return compiled;
}
function compileMessage2(desc) {
  const typeName = desc.typeName;
  const sortedFields = desc.fields.concat().sort((a, b) => a.number - b.number);
  const foreignField = sortedFields[0];
  const fieldWriters = [];
  const compiled = (writer, opts, message) => {
    if (message.$typeName !== typeName && foreignField !== void 0) {
      throw new FieldError(foreignField, `cannot use ${foreignField} with message ${message.$typeName}`, "ForeignFieldError");
    }
    for (let i = 0; i < fieldWriters.length; i++) {
      fieldWriters[i](writer, opts, message);
    }
    const unknown = message.$unknown;
    if (unknown !== void 0 && opts.writeUnknownFields) {
      for (let i = 0; i < unknown.length; i++) {
        const { no, wireType, data } = unknown[i];
        writer.tag(no, wireType).raw(data);
      }
    }
  };
  compiledWriters.set(desc, compiled);
  for (const field of sortedFields) {
    fieldWriters.push(compileField(field));
  }
  return compiled;
}
function compileField(field) {
  switch (field.fieldKind) {
    case "message":
    case "scalar":
    case "enum":
      return compileSingularField(field);
    case "list":
      return compileListField(field);
    case "map":
      return compileMapField(field);
  }
}
function compileSingularField(field) {
  const writeValue = compileSingularValue(field);
  const localName = field.localName;
  if (field.oneof) {
    const oneofLocalName = field.oneof.localName;
    return (writer, opts, message) => {
      const oneof = message[oneofLocalName];
      if (oneof.case === localName) {
        writeValue(writer, opts, oneof.value);
      }
    };
  }
  if (field.presence != IMPLICIT3) {
    const requiredError = field.presence == LEGACY_REQUIRED2 ? `cannot encode ${field} to binary: required field not set` : void 0;
    return (writer, opts, message) => {
      const value = message[localName];
      if (value !== void 0 && Object.prototype.hasOwnProperty.call(message, localName)) {
        writeValue(writer, opts, value);
      } else if (requiredError !== void 0) {
        throw new Error(requiredError);
      }
    };
  }
  if (field.fieldKind == "enum") {
    const zero = field.enum.values[0].number;
    return (writer, opts, message) => {
      const value = message[localName];
      if (value !== zero) {
        writeValue(writer, opts, value);
      }
    };
  }
  switch (field.scalar) {
    case ScalarType.BOOL:
      return (writer, opts, message) => {
        const value = message[localName];
        if (value !== false) {
          writeValue(writer, opts, value);
        }
      };
    case ScalarType.STRING:
      return (writer, opts, message) => {
        const value = message[localName];
        if (value !== "") {
          writeValue(writer, opts, value);
        }
      };
    case ScalarType.BYTES:
      return (writer, opts, message) => {
        const value = message[localName];
        if (!(value instanceof Uint8Array) || value.byteLength > 0) {
          writeValue(writer, opts, value);
        }
      };
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return (writer, opts, message) => {
        const value = message[localName];
        if (!Object.is(value, 0)) {
          writeValue(writer, opts, value);
        }
      };
    default:
      return (writer, opts, message) => {
        const value = message[localName];
        if (value != 0) {
          writeValue(writer, opts, value);
        }
      };
  }
}
function compileSingularValue(field) {
  switch (field.fieldKind) {
    case "message": {
      const { toMessage } = localMessageMapper(field);
      const writeChild = compileChildWriter(field);
      return (writer, opts, value) => {
        writeChild(writer, opts, toMessage(value));
      };
    }
    case "scalar":
    case "enum": {
      const scalarType = field.fieldKind == "enum" ? ScalarType.INT32 : field.scalar;
      const fieldNo = field.number;
      const wireType = writeTypeOfScalar(scalarType);
      const writeScalar = compileScalarValue(scalarType, field.parent.typeName, field.name);
      return (writer, opts, value) => {
        writer.tag(fieldNo, wireType);
        writeScalar(writer, value);
      };
    }
  }
}
function compileListField(field) {
  const localName = field.localName;
  const fieldNo = field.number;
  switch (field.listKind) {
    case "message": {
      const { toMessage } = localMessageMapper(field);
      const writeChild = compileChildWriter(field);
      return (writer, opts, message) => {
        const items = message[localName];
        for (let i = 0; i < items.length; i++) {
          writeChild(writer, opts, toMessage(items[i]));
        }
      };
    }
    case "scalar":
    case "enum": {
      const scalarType = field.listKind == "enum" ? ScalarType.INT32 : field.scalar;
      const writeScalar = compileScalarValue(scalarType, field.parent.typeName, field.name);
      if (field.packed) {
        return (writer, opts, message) => {
          const items = message[localName];
          if (items.length == 0) {
            return;
          }
          writer.tag(fieldNo, WireType.LengthDelimited).fork();
          for (let i = 0; i < items.length; i++) {
            writeScalar(writer, items[i]);
          }
          writer.join();
        };
      }
      const wireType = writeTypeOfScalar(scalarType);
      return (writer, opts, message) => {
        const items = message[localName];
        for (let i = 0; i < items.length; i++) {
          writer.tag(fieldNo, wireType);
          writeScalar(writer, items[i]);
        }
      };
    }
  }
}
function compileMapField(field) {
  const localName = field.localName;
  const fieldNo = field.number;
  const writeKey = compileMapKey(field);
  if (field.mapKind == "message") {
    const { toMessage } = localMessageMapper(field);
    const writeMessage = compiledWriter(field.message);
    return (writer, opts, message) => {
      const record = message[localName];
      const keys = Object.keys(record);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        writer.tag(fieldNo, WireType.LengthDelimited).fork();
        writeKey(writer, key);
        writer.tag(2, WireType.LengthDelimited).fork();
        writeMessage(writer, opts, toMessage(record[key]));
        writer.join();
        writer.join();
      }
    };
  }
  const scalarType = field.mapKind == "enum" ? ScalarType.INT32 : field.scalar;
  const valueWireType = writeTypeOfScalar(scalarType);
  const writeScalar = compileScalarValue(scalarType, field.parent.typeName, field.name);
  return (writer, opts, message) => {
    const record = message[localName];
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      writer.tag(fieldNo, WireType.LengthDelimited).fork();
      writeKey(writer, key);
      writer.tag(2, valueWireType);
      writeScalar(writer, record[key]);
      writer.join();
    }
  };
}
function compileMapKey(field) {
  const wireType = writeTypeOfScalar(field.mapKey);
  const writeScalar = compileScalarValue(field.mapKey, field.parent.typeName, field.name);
  const convertKey = compileMapKeyConverter(field.mapKey);
  return (writer, key) => {
    writer.tag(1, wireType);
    writeScalar(writer, convertKey(key));
  };
}
function compileMapKeyConverter(type) {
  switch (type) {
    case ScalarType.STRING:
      return (key) => key;
    case ScalarType.BOOL:
      return (key) => key === "true" ? true : key === "false" ? false : key;
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      return (key) => {
        try {
          return protoInt64.uParse(key);
        } catch (_a) {
          return key;
        }
      };
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      return (key) => {
        try {
          return protoInt64.parse(key);
        } catch (_a) {
          return key;
        }
      };
    default:
      return (key) => {
        const n = Number.parseInt(key);
        return Number.isFinite(n) ? n : key;
      };
  }
}
function compileScalarValue(type, messageName, fieldName) {
  const writeScalar = compileScalarWrite(type);
  return (writer, value) => {
    try {
      writeScalar(writer, value);
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`cannot encode field ${messageName}.${fieldName} to binary: ${e.message}`);
      }
      throw e;
    }
  };
}
function compileScalarWrite(type) {
  switch (type) {
    case ScalarType.STRING:
      return (writer, value) => writer.string(value);
    case ScalarType.BOOL:
      return (writer, value) => writer.bool(value);
    case ScalarType.DOUBLE:
      return (writer, value) => writer.double(value);
    case ScalarType.FLOAT:
      return (writer, value) => writer.float(value);
    case ScalarType.INT32:
      return (writer, value) => writer.int32(value);
    case ScalarType.INT64:
      return (writer, value) => writer.int64(value);
    case ScalarType.UINT64:
      return (writer, value) => writer.uint64(value);
    case ScalarType.FIXED64:
      return (writer, value) => writer.fixed64(value);
    case ScalarType.BYTES:
      return (writer, value) => writer.bytes(value);
    case ScalarType.FIXED32:
      return (writer, value) => writer.fixed32(value);
    case ScalarType.SFIXED32:
      return (writer, value) => writer.sfixed32(value);
    case ScalarType.SFIXED64:
      return (writer, value) => writer.sfixed64(value);
    case ScalarType.SINT64:
      return (writer, value) => writer.sint64(value);
    case ScalarType.UINT32:
      return (writer, value) => writer.uint32(value);
    case ScalarType.SINT32:
      return (writer, value) => writer.sint32(value);
  }
}
function compileChildWriter(field) {
  const fieldNo = field.number;
  const writeMessage = compiledWriter(field.message);
  if (field.delimitedEncoding) {
    return (writer, opts, child) => {
      writer.tag(fieldNo, WireType.StartGroup);
      writeMessage(writer, opts, child);
      writer.tag(fieldNo, WireType.EndGroup);
    };
  }
  return (writer, opts, child) => {
    writer.tag(fieldNo, WireType.LengthDelimited).fork();
    writeMessage(writer, opts, child);
    writer.join();
  };
}
function writeTypeOfScalar(type) {
  switch (type) {
    case ScalarType.BYTES:
    case ScalarType.STRING:
      return WireType.LengthDelimited;
    case ScalarType.DOUBLE:
    case ScalarType.FIXED64:
    case ScalarType.SFIXED64:
      return WireType.Bit64;
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.FLOAT:
      return WireType.Bit32;
    default:
      return WireType.Varint;
  }
}

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/generated/cp_model_pb.js
var file_cp_model = /* @__PURE__ */ fileDesc("Cg5jcF9tb2RlbC5wcm90bxIXb3BlcmF0aW9uc19yZXNlYXJjaC5zYXQiNAoUSW50ZWdlclZhcmlhYmxlUHJvdG8SDAoEbmFtZRgBIAEoCRIOCgZkb21haW4YAiADKAMiJQoRQm9vbEFyZ3VtZW50UHJvdG8SEAoIbGl0ZXJhbHMYASADKAUiRQoVTGluZWFyRXhwcmVzc2lvblByb3RvEgwKBHZhcnMYASADKAUSDgoGY29lZmZzGAIgAygDEg4KBm9mZnNldBgDIAEoAyKUAQoTTGluZWFyQXJndW1lbnRQcm90bxI+CgZ0YXJnZXQYASABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SPQoFZXhwcnMYAiADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8iXAobQWxsRGlmZmVyZW50Q29uc3RyYWludFByb3RvEj0KBWV4cHJzGAEgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIkUKFUxpbmVhckNvbnN0cmFpbnRQcm90bxIMCgR2YXJzGAEgAygFEg4KBmNvZWZmcxgCIAMoAxIOCgZkb21haW4YAyADKAMikQIKFkVsZW1lbnRDb25zdHJhaW50UHJvdG8SDQoFaW5kZXgYASABKAUSDgoGdGFyZ2V0GAIgASgFEgwKBHZhcnMYAyADKAUSRAoMbGluZWFyX2luZGV4GAQgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvEkUKDWxpbmVhcl90YXJnZXQYBSABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SPQoFZXhwcnMYBiADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8i0wEKF0ludGVydmFsQ29uc3RyYWludFByb3RvEj0KBXN0YXJ0GAQgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvEjsKA2VuZBgFIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxI8CgRzaXplGAYgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIi0KGE5vT3ZlcmxhcENvbnN0cmFpbnRQcm90bxIRCglpbnRlcnZhbHMYASADKAUiRgoaTm9PdmVybGFwMkRDb25zdHJhaW50UHJvdG8SEwoLeF9pbnRlcnZhbHMYASADKAUSEwoLeV9pbnRlcnZhbHMYAiADKAUisQEKGUN1bXVsYXRpdmVDb25zdHJhaW50UHJvdG8SQAoIY2FwYWNpdHkYASABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SEQoJaW50ZXJ2YWxzGAIgAygFEj8KB2RlbWFuZHMYAyADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8i6gEKGFJlc2Vydm9pckNvbnN0cmFpbnRQcm90bxIRCgltaW5fbGV2ZWwYASABKAMSEQoJbWF4X2xldmVsGAIgASgDEkIKCnRpbWVfZXhwcnMYAyADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SRQoNbGV2ZWxfY2hhbmdlcxgGIAMoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxIXCg9hY3RpdmVfbGl0ZXJhbHMYBSADKAVKBAgEEAUiSAoWQ2lyY3VpdENvbnN0cmFpbnRQcm90bxINCgV0YWlscxgDIAMoBRINCgVoZWFkcxgEIAMoBRIQCghsaXRlcmFscxgFIAMoBSKQAgoVUm91dGVzQ29uc3RyYWludFByb3RvEg0KBXRhaWxzGAEgAygFEg0KBWhlYWRzGAIgAygFEhAKCGxpdGVyYWxzGAMgAygFEg8KB2RlbWFuZHMYBCADKAUSEAoIY2FwYWNpdHkYBSABKAMSUgoKZGltZW5zaW9ucxgGIAMoCzI+Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJvdXRlc0NvbnN0cmFpbnRQcm90by5Ob2RlRXhwcmVzc2lvbnMaUAoPTm9kZUV4cHJlc3Npb25zEj0KBWV4cHJzGAEgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIoQBChRUYWJsZUNvbnN0cmFpbnRQcm90bxIMCgR2YXJzGAEgAygFEg4KBnZhbHVlcxgCIAMoAxI9CgVleHBycxgEIAMoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxIPCgduZWdhdGVkGAMgASgIIj0KFkludmVyc2VDb25zdHJhaW50UHJvdG8SEAoIZl9kaXJlY3QYASADKAUSEQoJZl9pbnZlcnNlGAIgAygFIuEBChhBdXRvbWF0b25Db25zdHJhaW50UHJvdG8SFgoOc3RhcnRpbmdfc3RhdGUYAiABKAMSFAoMZmluYWxfc3RhdGVzGAMgAygDEhcKD3RyYW5zaXRpb25fdGFpbBgEIAMoAxIXCg90cmFuc2l0aW9uX2hlYWQYBSADKAMSGAoQdHJhbnNpdGlvbl9sYWJlbBgGIAMoAxIMCgR2YXJzGAcgAygFEj0KBWV4cHJzGAggAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIiQKFExpc3RPZlZhcmlhYmxlc1Byb3RvEgwKBHZhcnMYASADKAUi8AwKD0NvbnN0cmFpbnRQcm90bxIMCgRuYW1lGAEgASgJEhsKE2VuZm9yY2VtZW50X2xpdGVyYWwYAiADKAUSPQoHYm9vbF9vchgDIAEoCzIqLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkJvb2xBcmd1bWVudFByb3RvSAASPgoIYm9vbF9hbmQYBCABKAsyKi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5Cb29sQXJndW1lbnRQcm90b0gAEkEKC2F0X21vc3Rfb25lGBogASgLMioub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQm9vbEFyZ3VtZW50UHJvdG9IABJBCgtleGFjdGx5X29uZRgdIAEoCzIqLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkJvb2xBcmd1bWVudFByb3RvSAASPgoIYm9vbF94b3IYBSABKAsyKi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5Cb29sQXJndW1lbnRQcm90b0gAEj8KB2ludF9kaXYYByABKAsyLC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJBcmd1bWVudFByb3RvSAASPwoHaW50X21vZBgIIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckFyZ3VtZW50UHJvdG9IABJACghpbnRfcHJvZBgLIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckFyZ3VtZW50UHJvdG9IABI/CgdsaW5fbWF4GBsgASgLMiwub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyQXJndW1lbnRQcm90b0gAEkAKBmxpbmVhchgMIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckNvbnN0cmFpbnRQcm90b0gAEkgKCGFsbF9kaWZmGA0gASgLMjQub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQWxsRGlmZmVyZW50Q29uc3RyYWludFByb3RvSAASQgoHZWxlbWVudBgOIAEoCzIvLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkVsZW1lbnRDb25zdHJhaW50UHJvdG9IABJCCgdjaXJjdWl0GA8gASgLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQ2lyY3VpdENvbnN0cmFpbnRQcm90b0gAEkAKBnJvdXRlcxgXIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJvdXRlc0NvbnN0cmFpbnRQcm90b0gAEj4KBXRhYmxlGBAgASgLMi0ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuVGFibGVDb25zdHJhaW50UHJvdG9IABJGCglhdXRvbWF0b24YESABKAsyMS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5BdXRvbWF0b25Db25zdHJhaW50UHJvdG9IABJCCgdpbnZlcnNlGBIgASgLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuSW52ZXJzZUNvbnN0cmFpbnRQcm90b0gAEkYKCXJlc2Vydm9pchgYIAEoCzIxLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJlc2Vydm9pckNvbnN0cmFpbnRQcm90b0gAEkQKCGludGVydmFsGBMgASgLMjAub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuSW50ZXJ2YWxDb25zdHJhaW50UHJvdG9IABJHCgpub19vdmVybGFwGBQgASgLMjEub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTm9PdmVybGFwQ29uc3RyYWludFByb3RvSAASTAoNbm9fb3ZlcmxhcF8yZBgVIAEoCzIzLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0Lk5vT3ZlcmxhcDJEQ29uc3RyYWludFByb3RvSAASSAoKY3VtdWxhdGl2ZRgWIAEoCzIyLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkN1bXVsYXRpdmVDb25zdHJhaW50UHJvdG9IABJJChBkdW1teV9jb25zdHJhaW50GB4gASgLMi0ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGlzdE9mVmFyaWFibGVzUHJvdG9IAEIMCgpjb25zdHJhaW50IuABChBDcE9iamVjdGl2ZVByb3RvEgwKBHZhcnMYASADKAUSDgoGY29lZmZzGAQgAygDEg4KBm9mZnNldBgCIAEoARIWCg5zY2FsaW5nX2ZhY3RvchgDIAEoARIOCgZkb21haW4YBSADKAMSGQoRc2NhbGluZ193YXNfZXhhY3QYBiABKAgSHQoVaW50ZWdlcl9iZWZvcmVfb2Zmc2V0GAcgASgDEhwKFGludGVnZXJfYWZ0ZXJfb2Zmc2V0GAkgASgDEh4KFmludGVnZXJfc2NhbGluZ19mYWN0b3IYCCABKAMiVQoTRmxvYXRPYmplY3RpdmVQcm90bxIMCgR2YXJzGAEgAygFEg4KBmNvZWZmcxgCIAMoARIOCgZvZmZzZXQYAyABKAESEAoIbWF4aW1pemUYBCABKAgigQUKFURlY2lzaW9uU3RyYXRlZ3lQcm90bxIRCgl2YXJpYWJsZXMYASADKAUSPQoFZXhwcnMYBSADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SbQobdmFyaWFibGVfc2VsZWN0aW9uX3N0cmF0ZWd5GAIgASgOMkgub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuRGVjaXNpb25TdHJhdGVneVByb3RvLlZhcmlhYmxlU2VsZWN0aW9uU3RyYXRlZ3kSaQoZZG9tYWluX3JlZHVjdGlvbl9zdHJhdGVneRgDIAEoDjJGLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkRlY2lzaW9uU3RyYXRlZ3lQcm90by5Eb21haW5SZWR1Y3Rpb25TdHJhdGVneSKUAQoZVmFyaWFibGVTZWxlY3Rpb25TdHJhdGVneRIQCgxDSE9PU0VfRklSU1QQABIVChFDSE9PU0VfTE9XRVNUX01JThABEhYKEkNIT09TRV9ISUdIRVNUX01BWBACEhoKFkNIT09TRV9NSU5fRE9NQUlOX1NJWkUQAxIaChZDSE9PU0VfTUFYX0RPTUFJTl9TSVpFEAQipAEKF0RvbWFpblJlZHVjdGlvblN0cmF0ZWd5EhQKEFNFTEVDVF9NSU5fVkFMVUUQABIUChBTRUxFQ1RfTUFYX1ZBTFVFEAESFQoRU0VMRUNUX0xPV0VSX0hBTEYQAhIVChFTRUxFQ1RfVVBQRVJfSEFMRhADEhcKE1NFTEVDVF9NRURJQU5fVkFMVUUQBBIWChJTRUxFQ1RfUkFORE9NX0hBTEYQBSI5ChlQYXJ0aWFsVmFyaWFibGVBc3NpZ25tZW50EgwKBHZhcnMYASADKAUSDgoGdmFsdWVzGAIgAygDIj4KFlNwYXJzZVBlcm11dGF0aW9uUHJvdG8SDwoHc3VwcG9ydBgBIAMoBRITCgtjeWNsZV9zaXplcxgCIAMoBSJHChBEZW5zZU1hdHJpeFByb3RvEhAKCG51bV9yb3dzGAEgASgFEhAKCG51bV9jb2xzGAIgASgFEg8KB2VudHJpZXMYAyADKAUilAEKDVN5bW1ldHJ5UHJvdG8SRQoMcGVybXV0YXRpb25zGAEgAygLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU3BhcnNlUGVybXV0YXRpb25Qcm90bxI8CglvcmJpdG9wZXMYAiADKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5EZW5zZU1hdHJpeFByb3RvIo4ECgxDcE1vZGVsUHJvdG8SDAoEbmFtZRgBIAEoCRJACgl2YXJpYWJsZXMYAiADKAsyLS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5JbnRlZ2VyVmFyaWFibGVQcm90bxI9Cgtjb25zdHJhaW50cxgDIAMoCzIoLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkNvbnN0cmFpbnRQcm90bxI8CglvYmplY3RpdmUYBCABKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcE9iamVjdGl2ZVByb3RvEk4KGGZsb2F0aW5nX3BvaW50X29iamVjdGl2ZRgJIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkZsb2F0T2JqZWN0aXZlUHJvdG8SRwoPc2VhcmNoX3N0cmF0ZWd5GAUgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuRGVjaXNpb25TdHJhdGVneVByb3RvEkkKDXNvbHV0aW9uX2hpbnQYBiABKAsyMi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5QYXJ0aWFsVmFyaWFibGVBc3NpZ25tZW50EhMKC2Fzc3VtcHRpb25zGAcgAygFEjgKCHN5bW1ldHJ5GAggASgLMiYub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU3ltbWV0cnlQcm90byIiChBDcFNvbHZlclNvbHV0aW9uEg4KBnZhbHVlcxgBIAMoAyKxBgoQQ3BTb2x2ZXJSZXNwb25zZRI3CgZzdGF0dXMYASABKA4yJy5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcFNvbHZlclN0YXR1cxIQCghzb2x1dGlvbhgCIAMoAxIXCg9vYmplY3RpdmVfdmFsdWUYAyABKAESHAoUYmVzdF9vYmplY3RpdmVfYm91bmQYBCABKAESRwoUYWRkaXRpb25hbF9zb2x1dGlvbnMYGyADKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcFNvbHZlclNvbHV0aW9uEkoKE3RpZ2h0ZW5lZF92YXJpYWJsZXMYFSADKAsyLS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5JbnRlZ2VyVmFyaWFibGVQcm90bxIwCihzdWZmaWNpZW50X2Fzc3VtcHRpb25zX2Zvcl9pbmZlYXNpYmlsaXR5GBcgAygFEkQKEWludGVnZXJfb2JqZWN0aXZlGBwgASgLMikub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQ3BPYmplY3RpdmVQcm90bxIjChtpbm5lcl9vYmplY3RpdmVfbG93ZXJfYm91bmQYHSABKAMSFAoMbnVtX2ludGVnZXJzGB4gASgDEhQKDG51bV9ib29sZWFucxgKIAEoAxIaChJudW1fZml4ZWRfYm9vbGVhbnMYHyABKAMSFQoNbnVtX2NvbmZsaWN0cxgLIAEoAxIUCgxudW1fYnJhbmNoZXMYDCABKAMSHwoXbnVtX2JpbmFyeV9wcm9wYWdhdGlvbnMYDSABKAMSIAoYbnVtX2ludGVnZXJfcHJvcGFnYXRpb25zGA4gASgDEhQKDG51bV9yZXN0YXJ0cxgYIAEoAxIZChFudW1fbHBfaXRlcmF0aW9ucxgZIAEoAxIRCgl3YWxsX3RpbWUYDyABKAESEQoJdXNlcl90aW1lGBAgASgBEhoKEmRldGVybWluaXN0aWNfdGltZRgRIAEoARIUCgxnYXBfaW50ZWdyYWwYFiABKAESFQoNc29sdXRpb25faW5mbxgUIAEoCRIRCglzb2x2ZV9sb2cYGiABKAkqWwoOQ3BTb2x2ZXJTdGF0dXMSCwoHVU5LTk9XThAAEhEKDU1PREVMX0lOVkFMSUQQARIMCghGRUFTSUJMRRACEg4KCklORkVBU0lCTEUQAxILCgdPUFRJTUFMEARCdgoWY29tLmdvb2dsZS5vcnRvb2xzLnNhdEIPQ3BNb2RlbFByb3RvYnVmUAFaNGdpdGh1Yi5jb20vZ29vZ2xlL29yLXRvb2xzL29ydG9vbHMvc2F0L3Byb3RvL2NwbW9kZWyqAhJHb29nbGUuT3JUb29scy5TYXRiBnByb3RvMw");
var IntegerVariableProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 0);
var BoolArgumentProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 1);
var LinearExpressionProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 2);
var AllDifferentConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 4);
var LinearConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 5);
var IntervalConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 7);
var NoOverlapConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 8);
var CircuitConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 12);
var ConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 18);
var CpObjectiveProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 19);
var DecisionStrategyProto_VariableSelectionStrategy;
(function(DecisionStrategyProto_VariableSelectionStrategy2) {
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_FIRST"] = 0] = "CHOOSE_FIRST";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_LOWEST_MIN"] = 1] = "CHOOSE_LOWEST_MIN";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_HIGHEST_MAX"] = 2] = "CHOOSE_HIGHEST_MAX";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_MIN_DOMAIN_SIZE"] = 3] = "CHOOSE_MIN_DOMAIN_SIZE";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_MAX_DOMAIN_SIZE"] = 4] = "CHOOSE_MAX_DOMAIN_SIZE";
})(DecisionStrategyProto_VariableSelectionStrategy || (DecisionStrategyProto_VariableSelectionStrategy = {}));
var DecisionStrategyProto_DomainReductionStrategy;
(function(DecisionStrategyProto_DomainReductionStrategy2) {
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MIN_VALUE"] = 0] = "SELECT_MIN_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MAX_VALUE"] = 1] = "SELECT_MAX_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_LOWER_HALF"] = 2] = "SELECT_LOWER_HALF";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_UPPER_HALF"] = 3] = "SELECT_UPPER_HALF";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MEDIAN_VALUE"] = 4] = "SELECT_MEDIAN_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_RANDOM_HALF"] = 5] = "SELECT_RANDOM_HALF";
})(DecisionStrategyProto_DomainReductionStrategy || (DecisionStrategyProto_DomainReductionStrategy = {}));
var PartialVariableAssignmentSchema = /* @__PURE__ */ messageDesc(file_cp_model, 22);
var CpModelProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 26);
var CpSolverResponseSchema = /* @__PURE__ */ messageDesc(file_cp_model, 28);
var CpSolverStatus;
(function(CpSolverStatus2) {
  CpSolverStatus2[CpSolverStatus2["UNKNOWN"] = 0] = "UNKNOWN";
  CpSolverStatus2[CpSolverStatus2["MODEL_INVALID"] = 1] = "MODEL_INVALID";
  CpSolverStatus2[CpSolverStatus2["FEASIBLE"] = 2] = "FEASIBLE";
  CpSolverStatus2[CpSolverStatus2["INFEASIBLE"] = 3] = "INFEASIBLE";
  CpSolverStatus2[CpSolverStatus2["OPTIMAL"] = 4] = "OPTIMAL";
})(CpSolverStatus || (CpSolverStatus = {}));

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/generated/sat_parameters_pb.js
var file_sat_parameters = /* @__PURE__ */ fileDesc("ChRzYXRfcGFyYW1ldGVycy5wcm90bxIXb3BlcmF0aW9uc19yZXNlYXJjaC5zYXQinHUKDVNhdFBhcmFtZXRlcnMSDwoEbmFtZRirASABKAk6ABJgChhwcmVmZXJyZWRfdmFyaWFibGVfb3JkZXIYASABKA4yNC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLlZhcmlhYmxlT3JkZXI6CElOX09SREVSElkKEGluaXRpYWxfcG9sYXJpdHkYAiABKA4yLy5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLlBvbGFyaXR5Og5QT0xBUklUWV9GQUxTRRIeChB1c2VfcGhhc2Vfc2F2aW5nGCwgASgIOgR0cnVlEikKGnBvbGFyaXR5X3JlcGhhc2VfaW5jcmVtZW50GKgBIAEoBToEMTAwMBIpChlwb2xhcml0eV9leHBsb2l0X2xzX2hpbnRzGLUCIAEoCDoFZmFsc2USIAoVcmFuZG9tX3BvbGFyaXR5X3JhdGlvGC0gASgBOgEwEiAKFXJhbmRvbV9icmFuY2hlc19yYXRpbxggIAEoAToBMBIhChJ1c2VfZXJ3YV9oZXVyaXN0aWMYSyABKAg6BWZhbHNlEiUKGmluaXRpYWxfdmFyaWFibGVzX2FjdGl2aXR5GEwgASgBOgEwEjYKJ2Fsc29fYnVtcF92YXJpYWJsZXNfaW5fY29uZmxpY3RfcmVhc29ucxhNIAEoCDoFZmFsc2USbwoWbWluaW1pemF0aW9uX2FsZ29yaXRobRgEIAEoDjJELm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuQ29uZmxpY3RNaW5pbWl6YXRpb25BbGdvcml0aG06CVJFQ1VSU0lWRRKTAQodYmluYXJ5X21pbmltaXphdGlvbl9hbGdvcml0aG0YIiABKA4yQC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLkJpbmFyeU1pbml6YXRpb25BbGdvcml0aG06KkJJTkFSWV9NSU5JTUlaQVRJT05fRlJPTV9VSVBfQU5EX0RFQ0lTSU9OUxIyCiRzdWJzdW1wdGlvbl9kdXJpbmdfY29uZmxpY3RfYW5hbHlzaXMYOCABKAg6BHRydWUSOQoqZXh0cmFfc3Vic3VtcHRpb25fZHVyaW5nX2NvbmZsaWN0X2FuYWx5c2lzGN8CIAEoCDoEdHJ1ZRI8Ci1kZWNpc2lvbl9zdWJzdW1wdGlvbl9kdXJpbmdfY29uZmxpY3RfYW5hbHlzaXMY4QIgASgIOgR0cnVlEiwKIGVhZ2VybHlfc3Vic3VtZV9sYXN0X25fY29uZmxpY3RzGNcCIAEoBToBNBIqChtzdWJzdW1lX2R1cmluZ192aXZpZmljYXRpb24Y4wIgASgIOgR0cnVlEi4KHnVzZV9jaHJvbm9sb2dpY2FsX2JhY2t0cmFja2luZxjKAiABKAg6BWZhbHNlEiAKE21heF9iYWNranVtcF9sZXZlbHMYywIgASgFOgI1MBI0CiVjaHJvbm9sb2dpY2FsX2JhY2t0cmFja19taW5fY29uZmxpY3RzGMwCIAEoBToEMTAwMBIkChVjbGF1c2VfY2xlYW51cF9wZXJpb2QYCyABKAU6BTEwMDAwEisKH2NsYXVzZV9jbGVhbnVwX3BlcmlvZF9pbmNyZW1lbnQY0QIgASgFOgEwEiAKFWNsYXVzZV9jbGVhbnVwX3RhcmdldBgNIAEoBToBMBIiChRjbGF1c2VfY2xlYW51cF9yYXRpbxi+ASABKAE6AzAuNRIjChhjbGF1c2VfY2xlYW51cF9sYmRfYm91bmQYOyABKAU6ATUSJAoYY2xhdXNlX2NsZWFudXBfbGJkX3RpZXIxGN0CIAEoBToBMBIkChhjbGF1c2VfY2xlYW51cF9sYmRfdGllcjIY3gIgASgFOgEwEmcKF2NsYXVzZV9jbGVhbnVwX29yZGVyaW5nGDwgASgOMjUub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5DbGF1c2VPcmRlcmluZzoPQ0xBVVNFX0FDVElWSVRZEiEKFHBiX2NsZWFudXBfaW5jcmVtZW50GC4gASgFOgMyMDASHQoQcGJfY2xlYW51cF9yYXRpbxgvIAEoAToDMC41EiQKF3ZhcmlhYmxlX2FjdGl2aXR5X2RlY2F5GA8gASgBOgMwLjgSKwobbWF4X3ZhcmlhYmxlX2FjdGl2aXR5X3ZhbHVlGBAgASgBOgYxZSsxMDASHwoRZ2x1Y29zZV9tYXhfZGVjYXkYFiABKAE6BDAuOTUSJQoXZ2x1Y29zZV9kZWNheV9pbmNyZW1lbnQYFyABKAE6BDAuMDESLAoeZ2x1Y29zZV9kZWNheV9pbmNyZW1lbnRfcGVyaW9kGBggASgFOgQ1MDAwEiQKFWNsYXVzZV9hY3Rpdml0eV9kZWNheRgRIAEoAToFMC45OTkSKAoZbWF4X2NsYXVzZV9hY3Rpdml0eV92YWx1ZRgSIAEoAToFMWUrMjASUwoScmVzdGFydF9hbGdvcml0aG1zGD0gAygOMjcub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5SZXN0YXJ0QWxnb3JpdGhtEmUKGmRlZmF1bHRfcmVzdGFydF9hbGdvcml0aG1zGEYgASgJOkFMVUJZX1JFU1RBUlQsTEJEX01PVklOR19BVkVSQUdFX1JFU1RBUlQsRExfTU9WSU5HX0FWRVJBR0VfUkVTVEFSVBIaCg5yZXN0YXJ0X3BlcmlvZBgeIAEoBToCNTASJwobcmVzdGFydF9ydW5uaW5nX3dpbmRvd19zaXplGD4gASgFOgI1MBIjChhyZXN0YXJ0X2RsX2F2ZXJhZ2VfcmF0aW8YPyABKAE6ATESJAoZcmVzdGFydF9sYmRfYXZlcmFnZV9yYXRpbxhHIAEoAToBMRIjChR1c2VfYmxvY2tpbmdfcmVzdGFydBhAIAEoCDoFZmFsc2USKgocYmxvY2tpbmdfcmVzdGFydF93aW5kb3dfc2l6ZRhBIAEoBToENTAwMBIoChtibG9ja2luZ19yZXN0YXJ0X211bHRpcGxpZXIYQiABKAE6AzEuNBIwCiVudW1fY29uZmxpY3RzX2JlZm9yZV9zdHJhdGVneV9jaGFuZ2VzGEQgASgFOgEwEikKHnN0cmF0ZWd5X2NoYW5nZV9pbmNyZWFzZV9yYXRpbxhFIAEoAToBMBIgChNtYXhfdGltZV9pbl9zZWNvbmRzGCQgASgBOgNpbmYSIwoWbWF4X2RldGVybWluaXN0aWNfdGltZRhDIAEoAToDaW5mEikKHW1heF9udW1fZGV0ZXJtaW5pc3RpY19iYXRjaGVzGKMCIAEoBToBMBI0ChdtYXhfbnVtYmVyX29mX2NvbmZsaWN0cxglIAEoAzoTOTIyMzM3MjAzNjg1NDc3NTgwNxIfChBtYXhfbWVtb3J5X2luX21iGCggASgDOgUxMDAwMBIjChJhYnNvbHV0ZV9nYXBfbGltaXQYnwEgASgBOgYwLjAwMDESHgoScmVsYXRpdmVfZ2FwX2xpbWl0GKABIAEoAToBMBIWCgtyYW5kb21fc2VlZBgfIAEoBToBMRIpChlwZXJtdXRlX3ZhcmlhYmxlX3JhbmRvbWx5GLIBIAEoCDoFZmFsc2USMQohcGVybXV0ZV9wcmVzb2x2ZV9jb25zdHJhaW50X29yZGVyGLMBIAEoCDoFZmFsc2USHwoPdXNlX2Fic2xfcmFuZG9tGLQBIAEoCDoFZmFsc2USIgoTbG9nX3NlYXJjaF9wcm9ncmVzcxgpIAEoCDoFZmFsc2USKAoYbG9nX3N1YnNvbHZlcl9zdGF0aXN0aWNzGL0BIAEoCDoFZmFsc2USFQoKbG9nX3ByZWZpeBi5ASABKAk6ABIcCg1sb2dfdG9fc3Rkb3V0GLoBIAEoCDoEdHJ1ZRIfCg9sb2dfdG9fcmVzcG9uc2UYuwEgASgIOgVmYWxzZRIgChF1c2VfcGJfcmVzb2x1dGlvbhgrIAEoCDoFZmFsc2USNgonbWluaW1pemVfcmVkdWN0aW9uX2R1cmluZ19wYl9yZXNvbHV0aW9uGDAgASgIOgVmYWxzZRIsCh5jb3VudF9hc3N1bXB0aW9uX2xldmVsc19pbl9sYmQYMSABKAg6BHRydWUSIwoWcHJlc29sdmVfYnZlX3RocmVzaG9sZBg2IAEoBToDNTAwEiwKHGZpbHRlcl9zYXRfcG9zdHNvbHZlX2NsYXVzZXMYxAIgASgIOgVmYWxzZRIlChpwcmVzb2x2ZV9idmVfY2xhdXNlX3dlaWdodBg3IAEoBToBMxIsCiBwcm9iaW5nX2RldGVybWluaXN0aWNfdGltZV9saW1pdBjiASABKAE6ATESNQopcHJlc29sdmVfcHJvYmluZ19kZXRlcm1pbmlzdGljX3RpbWVfbGltaXQYOSABKAE6AjMwEiUKF3ByZXNvbHZlX2Jsb2NrZWRfY2xhdXNlGFggASgIOgR0cnVlEh4KEHByZXNvbHZlX3VzZV9idmEYSCABKAg6BHRydWUSIQoWcHJlc29sdmVfYnZhX3RocmVzaG9sZBhJIAEoBToBMRIjChdtYXhfcHJlc29sdmVfaXRlcmF0aW9ucxiKASABKAU6ATMSHwoRY3BfbW9kZWxfcHJlc29sdmUYViABKAg6BHRydWUSIQoWY3BfbW9kZWxfcHJvYmluZ19sZXZlbBhuIAEoBToBMhInChljcF9tb2RlbF91c2Vfc2F0X3ByZXNvbHZlGF0gASgIOgR0cnVlEjEKIWxvYWRfYXRfbW9zdF9vbmVzX2luX3NhdF9wcmVzb2x2ZRjPAiABKAg6BWZhbHNlEisKHHJlbW92ZV9maXhlZF92YXJpYWJsZXNfZWFybHkYtgIgASgIOgR0cnVlEiYKFmRldGVjdF90YWJsZV93aXRoX2Nvc3QY2AEgASgIOgVmYWxzZRIjChd0YWJsZV9jb21wcmVzc2lvbl9sZXZlbBjZASABKAU6ATISKgoaZXhwYW5kX2FsbGRpZmZfY29uc3RyYWludHMYqgEgASgIOgVmYWxzZRIlChdtYXhfYWxsZGlmZl9kb21haW5fc2l6ZRjAAiABKAU6AzI1NhIrChxleHBhbmRfcmVzZXJ2b2lyX2NvbnN0cmFpbnRzGLYBIAEoCDoEdHJ1ZRIxCiVtYXhfZG9tYWluX3NpemVfZm9yX2xpbmVhcjJfZXhwYW5zaW9uGNQCIAEoBToBOBIuCh5leHBhbmRfcmVzZXJ2b2lyX3VzaW5nX2NpcmN1aXQYoAIgASgIOgVmYWxzZRIuCh5lbmNvZGVfY3VtdWxhdGl2ZV9hc19yZXNlcnZvaXIYnwIgASgIOgVmYWxzZRIqCh5tYXhfbGluX21heF9zaXplX2Zvcl9leHBhbnNpb24YmAIgASgFOgEwEiwKHGRpc2FibGVfY29uc3RyYWludF9leHBhbnNpb24YtQEgASgIOgVmYWxzZRI9Ci1lbmNvZGVfY29tcGxleF9saW5lYXJfY29uc3RyYWludF93aXRoX2ludGVnZXIY3wEgASgIOgVmYWxzZRIrChttZXJnZV9ub19vdmVybGFwX3dvcmtfbGltaXQYkQEgASgBOgUxZSsxMhIsChxtZXJnZV9hdF9tb3N0X29uZV93b3JrX2xpbWl0GJIBIAEoAToFMWUrMDgSJwobcHJlc29sdmVfc3Vic3RpdHV0aW9uX2xldmVsGJMBIAEoBToBMRI0CiRwcmVzb2x2ZV9leHRyYWN0X2ludGVnZXJfZW5mb3JjZW1lbnQYrgEgASgIOgVmYWxzZRIxCh1wcmVzb2x2ZV9pbmNsdXNpb25fd29ya19saW1pdBjJASABKAM6CTEwMDAwMDAwMBIbCgxpZ25vcmVfbmFtZXMYygEgASgIOgR0cnVlEh4KD2luZmVyX2FsbF9kaWZmcxjpASABKAg6BHRydWUSJgoXZmluZF9iaWdfbGluZWFyX292ZXJsYXAY6gEgASgIOgR0cnVlEjAKIWZpbmRfY2xhdXNlc190aGF0X2FyZV9leGFjdGx5X29uZRjNAiABKAg6BHRydWUSIwoUdXNlX3NhdF9pbnByb2Nlc3NpbmcYowEgASgIOgR0cnVlEiYKGGlucHJvY2Vzc2luZ19kdGltZV9yYXRpbxiRAiABKAE6AzAuMhImChppbnByb2Nlc3NpbmdfcHJvYmluZ19kdGltZRiSAiABKAE6ATESKwofaW5wcm9jZXNzaW5nX21pbmltaXphdGlvbl9kdGltZRiTAiABKAE6ATESPgovaW5wcm9jZXNzaW5nX21pbmltaXphdGlvbl91c2VfY29uZmxpY3RfYW5hbHlzaXMYqQIgASgIOgR0cnVlEjsKK2lucHJvY2Vzc2luZ19taW5pbWl6YXRpb25fdXNlX2FsbF9vcmRlcmluZ3MYqgIgASgIOgVmYWxzZRIyCiNpbnByb2Nlc3NpbmdfdXNlX2NvbmdydWVuY2VfY2xvc3VyZRjWAiABKAg6BHRydWUSLQodaW5wcm9jZXNzaW5nX3VzZV9zYXRfc3dlZXBpbmcY4gIgASgIOgVmYWxzZRIXCgtudW1fd29ya2VycxjOASABKAU6ATASHQoSbnVtX3NlYXJjaF93b3JrZXJzGGQgASgFOgEwEh8KE251bV9mdWxsX3N1YnNvbHZlcnMYpgIgASgFOgEwEhMKCnN1YnNvbHZlcnMYzwEgAygJEhkKEGV4dHJhX3N1YnNvbHZlcnMY2wEgAygJEhoKEWlnbm9yZV9zdWJzb2x2ZXJzGNEBIAMoCRIaChFmaWx0ZXJfc3Vic29sdmVycxilAiADKAkSQQoQc3Vic29sdmVyX3BhcmFtcxjSASADKAsyJi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzEiEKEWludGVybGVhdmVfc2VhcmNoGIgBIAEoCDoFZmFsc2USIQoVaW50ZXJsZWF2ZV9iYXRjaF9zaXplGIYBIAEoBToBMBIkChZzaGFyZV9vYmplY3RpdmVfYm91bmRzGHEgASgIOgR0cnVlEiUKF3NoYXJlX2xldmVsX3plcm9fYm91bmRzGHIgASgIOgR0cnVlEiQKFHNoYXJlX2xpbmVhcjJfYm91bmRzGMYCIAEoCDoFZmFsc2USIwoUc2hhcmVfYmluYXJ5X2NsYXVzZXMYywEgASgIOgR0cnVlEiEKEnNoYXJlX2dsdWVfY2xhdXNlcxidAiABKAg6BHRydWUSJgoXbWluaW1pemVfc2hhcmVkX2NsYXVzZXMYrAIgASgIOgR0cnVlEiQKGHNoYXJlX2dsdWVfY2xhdXNlc19kdGltZRjCAiABKAE6ATESIAoQY2hlY2tfbHJhdF9wcm9vZhjYAiABKAg6BWZhbHNlEicKF2NoZWNrX21lcmdlZF9scmF0X3Byb29mGOACIAEoCDoFZmFsc2USIQoRb3V0cHV0X2xyYXRfcHJvb2YY2QIgASgIOgVmYWxzZRIgChBjaGVja19kcmF0X3Byb29mGNoCIAEoCDoFZmFsc2USIQoRb3V0cHV0X2RyYXRfcHJvb2YY2wIgASgIOgVmYWxzZRImChhtYXhfZHJhdF90aW1lX2luX3NlY29uZHMY3AIgASgBOgNpbmYSMAogZGVidWdfcG9zdHNvbHZlX3dpdGhfZnVsbF9zb2x2ZXIYogEgASgIOgVmYWxzZRItCiFkZWJ1Z19tYXhfbnVtX3ByZXNvbHZlX29wZXJhdGlvbnMYlwEgASgFOgEwEicKF2RlYnVnX2NyYXNoX29uX2JhZF9oaW50GMMBIAEoCDoFZmFsc2USMwojZGVidWdfY3Jhc2hfaWZfcHJlc29sdmVfYnJlYWtzX2hpbnQYsgIgASgIOgVmYWxzZRIvCh9kZWJ1Z19jcmFzaF9pZl9scmF0X2NoZWNrX2ZhaWxzGNMCIAEoCDoFZmFsc2USJAoWdXNlX29wdGltaXphdGlvbl9oaW50cxgjIAEoCDoEdHJ1ZRIiChdjb3JlX21pbmltaXphdGlvbl9sZXZlbBgyIAEoBToBMhIhChNmaW5kX211bHRpcGxlX2NvcmVzGFQgASgIOgR0cnVlEiAKEmNvdmVyX29wdGltaXphdGlvbhhZIAEoCDoEdHJ1ZRJ4ChhtYXhfc2F0X2Fzc3VtcHRpb25fb3JkZXIYMyABKA4yPC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLk1heFNhdEFzc3VtcHRpb25PcmRlcjoYREVGQVVMVF9BU1NVTVBUSU9OX09SREVSEi8KIG1heF9zYXRfcmV2ZXJzZV9hc3N1bXB0aW9uX29yZGVyGDQgASgIOgVmYWxzZRJ8ChZtYXhfc2F0X3N0cmF0aWZpY2F0aW9uGDUgASgOMkQub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5NYXhTYXRTdHJhdGlmaWNhdGlvbkFsZ29yaXRobToWU1RSQVRJRklDQVRJT05fREVTQ0VOVBIuCiFwcm9wYWdhdGlvbl9sb29wX2RldGVjdGlvbl9mYWN0b3IY3QEgASgBOgIxMBI3Cil1c2VfcHJlY2VkZW5jZXNfaW5fZGlzanVuY3RpdmVfY29uc3RyYWludBhKIAEoCDoEdHJ1ZRIzCiF0cmFuc2l0aXZlX3ByZWNlZGVuY2VzX3dvcmtfbGltaXQYxwIgASgFOgcxMDAwMDAwEkIKNW1heF9zaXplX3RvX2NyZWF0ZV9wcmVjZWRlbmNlX2xpdGVyYWxzX2luX2Rpc2p1bmN0aXZlGOUBIAEoBToCNjASNQoldXNlX3N0cm9uZ19wcm9wYWdhdGlvbl9pbl9kaXNqdW5jdGl2ZRjmASABKAg6BWZhbHNlEjUKJXVzZV9keW5hbWljX3ByZWNlZGVuY2VfaW5fZGlzanVuY3RpdmUYhwIgASgIOgVmYWxzZRI0CiR1c2VfZHluYW1pY19wcmVjZWRlbmNlX2luX2N1bXVsYXRpdmUYjAIgASgIOgVmYWxzZRIxCiJ1c2Vfb3ZlcmxvYWRfY2hlY2tlcl9pbl9jdW11bGF0aXZlGE4gASgIOgVmYWxzZRI3Cid1c2VfY29uc2VydmF0aXZlX3NjYWxlX292ZXJsb2FkX2NoZWNrZXIYngIgASgIOgVmYWxzZRI3Cih1c2VfdGltZXRhYmxlX2VkZ2VfZmluZGluZ19pbl9jdW11bGF0aXZlGE8gASgIOgVmYWxzZRI6CixtYXhfbnVtX2ludGVydmFsc19mb3JfdGltZXRhYmxlX2VkZ2VfZmluZGluZxiEAiABKAU6AzEwMBIyCiJ1c2VfaGFyZF9wcmVjZWRlbmNlc19pbl9jdW11bGF0aXZlGNcBIAEoCDoFZmFsc2USJwoXZXhwbG9pdF9hbGxfcHJlY2VkZW5jZXMY3AEgASgIOgVmYWxzZRI2Cih1c2VfZGlzanVuY3RpdmVfY29uc3RyYWludF9pbl9jdW11bGF0aXZlGFAgASgIOgR0cnVlEjIKJW5vX292ZXJsYXBfMmRfYm9vbGVhbl9yZWxhdGlvbnNfbGltaXQYwQIgASgFOgIxMBIwCiB1c2VfdGltZXRhYmxpbmdfaW5fbm9fb3ZlcmxhcF8yZBjIASABKAg6BWZhbHNlEjgKKHVzZV9lbmVyZ2V0aWNfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQY1QEgASgIOgVmYWxzZRI9Ci11c2VfYXJlYV9lbmVyZ2V0aWNfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYjwIgASgIOgVmYWxzZRI3Cid1c2VfdHJ5X2VkZ2VfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYqwIgASgIOgVmYWxzZRI8Ci1tYXhfcGFpcnNfcGFpcndpc2VfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYlAIgASgFOgQxMjUwEkIKNm1heGltdW1fcmVnaW9uc190b19zcGxpdF9pbl9kaXNjb25uZWN0ZWRfbm9fb3ZlcmxhcF8yZBi7AiABKAU6ATASOAopdXNlX2xpbmVhcjNfZm9yX25vX292ZXJsYXBfMmRfcHJlY2VkZW5jZXMYwwIgASgIOgR0cnVlEi0KHnVzZV9kdWFsX3NjaGVkdWxpbmdfaGV1cmlzdGljcxjWASABKAg6BHRydWUSLQoddXNlX2FsbF9kaWZmZXJlbnRfZm9yX2NpcmN1aXQYtwIgASgIOgVmYWxzZRI9CjFyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLgCIAEoBToBMBJDCjdyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfdGlnaHRfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLkCIAEoBToBMBJDCjdyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfZXhhY3RfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLwCIAEoBToBOBI8CjByb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3Jfc2hvcnRlc3RfcGF0aHNfYm91bmQYvgIgASgFOgE4EiUKFXJvdXRpbmdfY3V0X2RwX2VmZm9ydBi6AiABKAE6BTFlKzA3EjIKJnJvdXRpbmdfY3V0X21heF9pbmZlYXNpYmxlX3BhdGhfbGVuZ3RoGL0CIAEoBToBNhJiChBzZWFyY2hfYnJhbmNoaW5nGFIgASgOMjYub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5TZWFyY2hCcmFuY2hpbmc6EEFVVE9NQVRJQ19TRUFSQ0gSIAoTaGludF9jb25mbGljdF9saW1pdBiZASABKAU6AjEwEhsKC3JlcGFpcl9oaW50GKcBIAEoCDoFZmFsc2USMwojZml4X3ZhcmlhYmxlc190b190aGVpcl9oaW50ZWRfdmFsdWUYwAEgASgIOgVmYWxzZRIiChJ1c2VfcHJvYmluZ19zZWFyY2gYsAEgASgIOgVmYWxzZRIjChR1c2VfZXh0ZW5kZWRfcHJvYmluZxiNAiABKAg6BHRydWUSLgoecHJvYmluZ19udW1fY29tYmluYXRpb25zX2xpbWl0GJACIAEoBToFMjAwMDASPAosc2hhdmluZ19kZXRlcm1pbmlzdGljX3RpbWVfaW5fcHJvYmluZ19zZWFyY2gYzAEgASgBOgUwLjAwMRIvCiFzaGF2aW5nX3NlYXJjaF9kZXRlcm1pbmlzdGljX3RpbWUYzQEgASgBOgMwLjESJQoYc2hhdmluZ19zZWFyY2hfdGhyZXNob2xkGKICIAEoAzoCNjQSJwoXdXNlX29iamVjdGl2ZV9sYl9zZWFyY2gY5AEgASgIOgVmYWxzZRIsChx1c2Vfb2JqZWN0aXZlX3NoYXZpbmdfc2VhcmNoGP0BIAEoCDoFZmFsc2USJAoXdmFyaWFibGVzX3NoYXZpbmdfbGV2ZWwYoQIgASgFOgItMRIuCiFwc2V1ZG9fY29zdF9yZWxpYWJpbGl0eV90aHJlc2hvbGQYeyABKAM6AzEwMBIhChJvcHRpbWl6ZV93aXRoX2NvcmUYUyABKAg6BWZhbHNlEiwKHG9wdGltaXplX3dpdGhfbGJfdHJlZV9zZWFyY2gYvAEgASgIOgVmYWxzZRIvCh9zYXZlX2xwX2Jhc2lzX2luX2xiX3RyZWVfc2VhcmNoGJwCIAEoCDoFZmFsc2USJwobYmluYXJ5X3NlYXJjaF9udW1fY29uZmxpY3RzGGMgASgFOgItMRIjChRvcHRpbWl6ZV93aXRoX21heF9ocxhVIAEoCDoFZmFsc2USIwoUdXNlX2ZlYXNpYmlsaXR5X2p1bXAYiQIgASgIOgR0cnVlEhsKC3VzZV9sc19vbmx5GPABIAEoCDoFZmFsc2USJQoWZmVhc2liaWxpdHlfanVtcF9kZWNheRjyASABKAE6BDAuOTUSMAokZmVhc2liaWxpdHlfanVtcF9saW5lYXJpemF0aW9uX2xldmVsGIECIAEoBToBMhIrCh9mZWFzaWJpbGl0eV9qdW1wX3Jlc3RhcnRfZmFjdG9yGIICIAEoBToBMRIqChxmZWFzaWJpbGl0eV9qdW1wX2JhdGNoX2R0aW1lGKQCIAEoAToDMC4xEj0KLmZlYXNpYmlsaXR5X2p1bXBfdmFyX3JhbmRvbWl6YXRpb25fcHJvYmFiaWxpdHkY9wEgASgBOgQwLjA1EjsKLWZlYXNpYmlsaXR5X2p1bXBfdmFyX3BlcmJ1cmJhdGlvbl9yYW5nZV9yYXRpbxj4ASABKAE6AzAuMhIvCiBmZWFzaWJpbGl0eV9qdW1wX2VuYWJsZV9yZXN0YXJ0cxj6ASABKAg6BHRydWUSOwotZmVhc2liaWxpdHlfanVtcF9tYXhfZXhwYW5kZWRfY29uc3RyYWludF9zaXplGIgCIAEoBToDNTAwEhwKEG51bV92aW9sYXRpb25fbHMY9AEgASgFOgEwEi4KIHZpb2xhdGlvbl9sc19wZXJ0dXJiYXRpb25fcGVyaW9kGPkBIAEoBToDMTAwEjQKJnZpb2xhdGlvbl9sc19jb21wb3VuZF9tb3ZlX3Byb2JhYmlsaXR5GIMCIAEoAToDMC41EiQKF3NoYXJlZF90cmVlX251bV93b3JrZXJzGOsBIAEoBToCLTESJgoWdXNlX3NoYXJlZF90cmVlX3NlYXJjaBjsASABKAg6BWZhbHNlEjcKK3NoYXJlZF90cmVlX3dvcmtlcl9taW5fcmVzdGFydHNfcGVyX3N1YnRyZWUYmgIgASgFOgExEjYKJ3NoYXJlZF90cmVlX3dvcmtlcl9lbmFibGVfdHJhaWxfc2hhcmluZxinAiABKAg6BHRydWUSNgonc2hhcmVkX3RyZWVfd29ya2VyX2VuYWJsZV9waGFzZV9zaGFyaW5nGLACIAEoCDoEdHJ1ZRIuCiJzaGFyZWRfdHJlZV9vcGVuX2xlYXZlc19wZXJfd29ya2VyGJkCIAEoAToBMhIwCiBzaGFyZWRfdHJlZV9tYXhfbm9kZXNfcGVyX3dvcmtlchjuASABKAU6BTEwMDAwEngKGnNoYXJlZF90cmVlX3NwbGl0X3N0cmF0ZWd5GO8BIAEoDjI+Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuU2hhcmVkVHJlZVNwbGl0U3RyYXRlZ3k6E1NQTElUX1NUUkFURUdZX0FVVE8SKQodc2hhcmVkX3RyZWVfYmFsYW5jZV90b2xlcmFuY2UYsQIgASgFOgExEikKG3NoYXJlZF90cmVlX3NwbGl0X21pbl9kdGltZRjIAiABKAE6AzAuMRImChdlbnVtZXJhdGVfYWxsX3NvbHV0aW9ucxhXIAEoCDoFZmFsc2USNwona2VlcF9hbGxfZmVhc2libGVfc29sdXRpb25zX2luX3ByZXNvbHZlGK0BIAEoCDoFZmFsc2USMgoiZmlsbF90aWdodGVuZWRfZG9tYWluc19pbl9yZXNwb25zZRiEASABKAg6BWZhbHNlEjUKJWZpbGxfYWRkaXRpb25hbF9zb2x1dGlvbnNfaW5fcmVzcG9uc2UYwgEgASgIOgVmYWxzZRInChlpbnN0YW50aWF0ZV9hbGxfdmFyaWFibGVzGGogASgIOgR0cnVlEjYKKGF1dG9fZGV0ZWN0X2dyZWF0ZXJfdGhhbl9hdF9sZWFzdF9vbmVfb2YYXyABKAg6BHRydWUSKAoZc3RvcF9hZnRlcl9maXJzdF9zb2x1dGlvbhhiIAEoCDoFZmFsc2USIwoTc3RvcF9hZnRlcl9wcmVzb2x2ZRiVASABKAg6BWZhbHNlEisKG3N0b3BfYWZ0ZXJfcm9vdF9wcm9wYWdhdGlvbhj8ASABKAg6BWZhbHNlEiQKFmxuc19pbml0aWFsX2RpZmZpY3VsdHkYswIgASgBOgMwLjUSLQofbG5zX2luaXRpYWxfZGV0ZXJtaW5pc3RpY19saW1pdBi0AiABKAE6AzAuMRIWCgd1c2VfbG5zGJsCIAEoCDoEdHJ1ZRIbCgx1c2VfbG5zX29ubHkYZSABKAg6BWZhbHNlEh4KEnNvbHV0aW9uX3Bvb2xfc2l6ZRjBASABKAU6ATMSKgodc29sdXRpb25fcG9vbF9kaXZlcnNpdHlfbGltaXQYyQIgASgFOgIxMBIhChVhbHRlcm5hdGl2ZV9wb29sX3NpemUYxQIgASgFOgExEhsKDHVzZV9yaW5zX2xucxiBASABKAg6BHRydWUSIwoUdXNlX2ZlYXNpYmlsaXR5X3B1bXAYpAEgASgIOgR0cnVlEh8KEHVzZV9sYl9yZWxheF9sbnMY/wEgASgIOgR0cnVlEisKHmxiX3JlbGF4X251bV93b3JrZXJzX3RocmVzaG9sZBioAiABKAU6AjE2EmMKC2ZwX3JvdW5kaW5nGKUBIAEoDjI3Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuRlBSb3VuZGluZ01ldGhvZDoUUFJPUEFHQVRJT05fQVNTSVNURUQSJAoUZGl2ZXJzaWZ5X2xuc19wYXJhbXMYiQEgASgIOgVmYWxzZRIfChByYW5kb21pemVfc2VhcmNoGGcgASgIOgVmYWxzZRIrCiBzZWFyY2hfcmFuZG9tX3ZhcmlhYmxlX3Bvb2xfc2l6ZRhoIAEoAzoBMBIrChtwdXNoX2FsbF90YXNrc190b3dhcmRfc3RhcnQYhgIgASgIOgVmYWxzZRIlChZ1c2Vfb3B0aW9uYWxfdmFyaWFibGVzGGwgASgIOgVmYWxzZRIhChN1c2VfZXhhY3RfbHBfcmVhc29uGG0gASgIOgR0cnVlEicKF3VzZV9jb21iaW5lZF9ub19vdmVybGFwGIUBIAEoCDoFZmFsc2USKgoeYXRfbW9zdF9vbmVfbWF4X2V4cGFuc2lvbl9zaXplGI4CIAEoBToBMxIiChNjYXRjaF9zaWdpbnRfc2lnbmFsGIcBIAEoCDoEdHJ1ZRIhChJ1c2VfaW1wbGllZF9ib3VuZHMYkAEgASgIOgR0cnVlEiIKEnBvbGlzaF9scF9zb2x1dGlvbhivASABKAg6BWZhbHNlEiMKE2xwX3ByaW1hbF90b2xlcmFuY2UYigIgASgBOgUxZS0wNxIhChFscF9kdWFsX3RvbGVyYW5jZRiLAiABKAE6BTFlLTA3EiAKEWNvbnZlcnRfaW50ZXJ2YWxzGLEBIAEoCDoEdHJ1ZRIaCg5zeW1tZXRyeV9sZXZlbBi3ASABKAU6ATISIgoSdXNlX3N5bW1ldHJ5X2luX2xwGK0CIAEoCDoFZmFsc2USKQoZa2VlcF9zeW1tZXRyeV9pbl9wcmVzb2x2ZRivAiABKAg6BWZhbHNlEjcKK3N5bW1ldHJ5X2RldGVjdGlvbl9kZXRlcm1pbmlzdGljX3RpbWVfbGltaXQYrgIgASgBOgExEiUKFm5ld19saW5lYXJfcHJvcGFnYXRpb24Y4AEgASgIOgR0cnVlEh8KEWxpbmVhcl9zcGxpdF9zaXplGIACIAEoBToDMTAwEh4KE2xpbmVhcml6YXRpb25fbGV2ZWwYWiABKAU6ATESIQoWYm9vbGVhbl9lbmNvZGluZ19sZXZlbBhrIAEoBToBMRI9CjBtYXhfZG9tYWluX3NpemVfd2hlbl9lbmNvZGluZ19lcV9uZXFfY29uc3RyYWludHMYvwEgASgFOgIxNhIbCgxtYXhfbnVtX2N1dHMYWyABKAU6BTEwMDAwEhUKCWN1dF9sZXZlbBjEASABKAU6ATESKgobb25seV9hZGRfY3V0c19hdF9sZXZlbF96ZXJvGFwgASgIOgVmYWxzZRIhChFhZGRfb2JqZWN0aXZlX2N1dBjFASABKAg6BWZhbHNlEhkKC2FkZF9jZ19jdXRzGHUgASgIOgR0cnVlEhoKDGFkZF9taXJfY3V0cxh4IAEoCDoEdHJ1ZRIhChJhZGRfemVyb19oYWxmX2N1dHMYqQEgASgIOgR0cnVlEh4KD2FkZF9jbGlxdWVfY3V0cxisASABKAg6BHRydWUSGwoMYWRkX3JsdF9jdXRzGJcCIAEoCDoEdHJ1ZRIiChVtYXhfYWxsX2RpZmZfY3V0X3NpemUYlAEgASgFOgI2NBIfChBhZGRfbGluX21heF9jdXRzGJgBIAEoCDoEdHJ1ZRIpChxtYXhfaW50ZWdlcl9yb3VuZGluZ19zY2FsaW5nGHcgASgFOgM2MDASJwoZYWRkX2xwX2NvbnN0cmFpbnRzX2xhemlseRhwIAEoCDoEdHJ1ZRIhChJyb290X2xwX2l0ZXJhdGlvbnMY4wEgASgFOgQyMDAwEjIKJG1pbl9vcnRob2dvbmFsaXR5X2Zvcl9scF9jb25zdHJhaW50cxhzIAEoAToEMC4wNRIoChxtYXhfY3V0X3JvdW5kc19hdF9sZXZlbF96ZXJvGJoBIAEoBToBMRIrCh5tYXhfY29uc2VjdXRpdmVfaW5hY3RpdmVfY291bnQYeSABKAU6AzEwMBIqChpjdXRfbWF4X2FjdGl2ZV9jb3VudF92YWx1ZRibASABKAE6BTFlKzEwEiQKFmN1dF9hY3RpdmVfY291bnRfZGVjYXkYnAEgASgBOgMwLjgSIQoSY3V0X2NsZWFudXBfdGFyZ2V0GJ0BIAEoBToEMTAwMBImChpuZXdfY29uc3RyYWludHNfYmF0Y2hfc2l6ZRh6IAEoBToCNTASKQobZXhwbG9pdF9pbnRlZ2VyX2xwX3NvbHV0aW9uGF4gASgIOgR0cnVlEiUKF2V4cGxvaXRfYWxsX2xwX3NvbHV0aW9uGHQgASgIOgR0cnVlEiUKFWV4cGxvaXRfYmVzdF9zb2x1dGlvbhiCASABKAg6BWZhbHNlEisKG2V4cGxvaXRfcmVsYXhhdGlvbl9zb2x1dGlvbhihASABKAg6BWZhbHNlEiAKEWV4cGxvaXRfb2JqZWN0aXZlGIMBIAEoCDoEdHJ1ZRIpChlkZXRlY3RfbGluZWFyaXplZF9wcm9kdWN0GJUCIAEoCDoFZmFsc2USMwojdXNlX25ld19pbnRlZ2VyX2NvbmZsaWN0X3Jlc29sdXRpb24Y0AIgASgIOgVmYWxzZRItCh5jcmVhdGVfMXVpcF9ib29sZWFuX2R1cmluZ19pY3IY1QIgASgIOgR0cnVlEhwKDW1pcF9tYXhfYm91bmQYfCABKAE6BTFlKzA3EhoKD21pcF92YXJfc2NhbGluZxh9IAEoAToBMRImChZtaXBfc2NhbGVfbGFyZ2VfZG9tYWluGOEBIAEoCDoFZmFsc2USMAohbWlwX2F1dG9tYXRpY2FsbHlfc2NhbGVfdmFyaWFibGVzGKYBIAEoCDoEdHJ1ZRIdCg1vbmx5X3NvbHZlX2lwGN4BIAEoCDoFZmFsc2USIwoUbWlwX3dhbnRlZF9wcmVjaXNpb24YfiABKAE6BTFlLTA2EiUKGW1pcF9tYXhfYWN0aXZpdHlfZXhwb25lbnQYfyABKAU6AjUzEiQKE21pcF9jaGVja19wcmVjaXNpb24YgAEgASgBOgYwLjAwMDESLwogbWlwX2NvbXB1dGVfdHJ1ZV9vYmplY3RpdmVfYm91bmQYxgEgASgIOgR0cnVlEicKF21pcF9tYXhfdmFsaWRfbWFnbml0dWRlGMcBIAEoAToFMWUrMjASOworbWlwX3RyZWF0X2hpZ2hfbWFnbml0dWRlX2JvdW5kc19hc19pbmZpbml0eRiWAiABKAg6BWZhbHNlEiIKEm1pcF9kcm9wX3RvbGVyYW5jZRjoASABKAE6BTFlLTE2Eh4KEm1pcF9wcmVzb2x2ZV9sZXZlbBiFAiABKAU6ATIiSAoNVmFyaWFibGVPcmRlchIMCghJTl9PUkRFUhAAEhQKEElOX1JFVkVSU0VfT1JERVIQARITCg9JTl9SQU5ET01fT1JERVIQAiJGCghQb2xhcml0eRIRCg1QT0xBUklUWV9UUlVFEAASEgoOUE9MQVJJVFlfRkFMU0UQARITCg9QT0xBUklUWV9SQU5ET00QAiJKCh1Db25mbGljdE1pbmltaXphdGlvbkFsZ29yaXRobRIICgROT05FEAASCgoGU0lNUExFEAESDQoJUkVDVVJTSVZFEAIiBAgDEAMimwEKGUJpbmFyeU1pbml6YXRpb25BbGdvcml0aG0SGgoWTk9fQklOQVJZX01JTklNSVpBVElPThAAEiAKHEJJTkFSWV9NSU5JTUlaQVRJT05fRlJPTV9VSVAQARIuCipCSU5BUllfTUlOSU1JWkFUSU9OX0ZST01fVUlQX0FORF9ERUNJU0lPTlMQBSIECAIQAiIECAMQAyIECAQQBCI1Cg5DbGF1c2VPcmRlcmluZxITCg9DTEFVU0VfQUNUSVZJVFkQABIOCgpDTEFVU0VfTEJEEAEihgEKEFJlc3RhcnRBbGdvcml0aG0SDgoKTk9fUkVTVEFSVBAAEhAKDExVQllfUkVTVEFSVBABEh0KGURMX01PVklOR19BVkVSQUdFX1JFU1RBUlQQAhIeChpMQkRfTU9WSU5HX0FWRVJBR0VfUkVTVEFSVBADEhEKDUZJWEVEX1JFU1RBUlQQBCJ0ChVNYXhTYXRBc3N1bXB0aW9uT3JkZXISHAoYREVGQVVMVF9BU1NVTVBUSU9OX09SREVSEAASHQoZT1JERVJfQVNTVU1QVElPTl9CWV9ERVBUSBABEh4KGk9SREVSX0FTU1VNUFRJT05fQllfV0VJR0hUEAIibwodTWF4U2F0U3RyYXRpZmljYXRpb25BbGdvcml0aG0SFwoTU1RSQVRJRklDQVRJT05fTk9ORRAAEhoKFlNUUkFUSUZJQ0FUSU9OX0RFU0NFTlQQARIZChVTVFJBVElGSUNBVElPTl9BU0NFTlQQAiLhAQoPU2VhcmNoQnJhbmNoaW5nEhQKEEFVVE9NQVRJQ19TRUFSQ0gQABIQCgxGSVhFRF9TRUFSQ0gQARIUChBQT1JURk9MSU9fU0VBUkNIEAISDQoJTFBfU0VBUkNIEAMSFgoSUFNFVURPX0NPU1RfU0VBUkNIEAQSJwojUE9SVEZPTElPX1dJVEhfUVVJQ0tfUkVTVEFSVF9TRUFSQ0gQBRIPCgtISU5UX1NFQVJDSBAGEhgKFFBBUlRJQUxfRklYRURfU0VBUkNIEAcSFQoRUkFORE9NSVpFRF9TRUFSQ0gQCCK4AQoXU2hhcmVkVHJlZVNwbGl0U3RyYXRlZ3kSFwoTU1BMSVRfU1RSQVRFR1lfQVVUTxAAEh4KGlNQTElUX1NUUkFURUdZX0RJU0NSRVBBTkNZEAESHwobU1BMSVRfU1RSQVRFR1lfT0JKRUNUSVZFX0xCEAISIAocU1BMSVRfU1RSQVRFR1lfQkFMQU5DRURfVFJFRRADEiEKHVNQTElUX1NUUkFURUdZX0ZJUlNUX1BST1BPU0FMEAQiaAoQRlBSb3VuZGluZ01ldGhvZBITCg9ORUFSRVNUX0lOVEVHRVIQABIOCgpMT0NLX0JBU0VEEAESFQoRQUNUSVZFX0xPQ0tfQkFTRUQQAxIYChRQUk9QQUdBVElPTl9BU1NJU1RFRBACQmsKFmNvbS5nb29nbGUub3J0b29scy5zYXRQAVo6Z2l0aHViLmNvbS9nb29nbGUvb3ItdG9vbHMvb3J0b29scy9zYXQvcHJvdG8vc2F0cGFyYW1ldGVyc6oCEkdvb2dsZS5PclRvb2xzLlNhdA");
var SatParametersSchema = /* @__PURE__ */ messageDesc(file_sat_parameters, 0);
var SatParameters_VariableOrder;
(function(SatParameters_VariableOrder2) {
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_ORDER"] = 0] = "IN_ORDER";
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_REVERSE_ORDER"] = 1] = "IN_REVERSE_ORDER";
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_RANDOM_ORDER"] = 2] = "IN_RANDOM_ORDER";
})(SatParameters_VariableOrder || (SatParameters_VariableOrder = {}));
var SatParameters_Polarity;
(function(SatParameters_Polarity2) {
  SatParameters_Polarity2[SatParameters_Polarity2["TRUE"] = 0] = "TRUE";
  SatParameters_Polarity2[SatParameters_Polarity2["FALSE"] = 1] = "FALSE";
  SatParameters_Polarity2[SatParameters_Polarity2["RANDOM"] = 2] = "RANDOM";
})(SatParameters_Polarity || (SatParameters_Polarity = {}));
var SatParameters_ConflictMinimizationAlgorithm;
(function(SatParameters_ConflictMinimizationAlgorithm2) {
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["NONE"] = 0] = "NONE";
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["SIMPLE"] = 1] = "SIMPLE";
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["RECURSIVE"] = 2] = "RECURSIVE";
})(SatParameters_ConflictMinimizationAlgorithm || (SatParameters_ConflictMinimizationAlgorithm = {}));
var SatParameters_BinaryMinizationAlgorithm;
(function(SatParameters_BinaryMinizationAlgorithm2) {
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["NO_BINARY_MINIMIZATION"] = 0] = "NO_BINARY_MINIMIZATION";
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["BINARY_MINIMIZATION_FROM_UIP"] = 1] = "BINARY_MINIMIZATION_FROM_UIP";
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS"] = 5] = "BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS";
})(SatParameters_BinaryMinizationAlgorithm || (SatParameters_BinaryMinizationAlgorithm = {}));
var SatParameters_ClauseOrdering;
(function(SatParameters_ClauseOrdering2) {
  SatParameters_ClauseOrdering2[SatParameters_ClauseOrdering2["CLAUSE_ACTIVITY"] = 0] = "CLAUSE_ACTIVITY";
  SatParameters_ClauseOrdering2[SatParameters_ClauseOrdering2["CLAUSE_LBD"] = 1] = "CLAUSE_LBD";
})(SatParameters_ClauseOrdering || (SatParameters_ClauseOrdering = {}));
var SatParameters_RestartAlgorithm;
(function(SatParameters_RestartAlgorithm2) {
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["NO_RESTART"] = 0] = "NO_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["LUBY_RESTART"] = 1] = "LUBY_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["DL_MOVING_AVERAGE_RESTART"] = 2] = "DL_MOVING_AVERAGE_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["LBD_MOVING_AVERAGE_RESTART"] = 3] = "LBD_MOVING_AVERAGE_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["FIXED_RESTART"] = 4] = "FIXED_RESTART";
})(SatParameters_RestartAlgorithm || (SatParameters_RestartAlgorithm = {}));
var SatParameters_MaxSatAssumptionOrder;
(function(SatParameters_MaxSatAssumptionOrder2) {
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["DEFAULT_ASSUMPTION_ORDER"] = 0] = "DEFAULT_ASSUMPTION_ORDER";
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["ORDER_ASSUMPTION_BY_DEPTH"] = 1] = "ORDER_ASSUMPTION_BY_DEPTH";
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["ORDER_ASSUMPTION_BY_WEIGHT"] = 2] = "ORDER_ASSUMPTION_BY_WEIGHT";
})(SatParameters_MaxSatAssumptionOrder || (SatParameters_MaxSatAssumptionOrder = {}));
var SatParameters_MaxSatStratificationAlgorithm;
(function(SatParameters_MaxSatStratificationAlgorithm2) {
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_NONE"] = 0] = "STRATIFICATION_NONE";
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_DESCENT"] = 1] = "STRATIFICATION_DESCENT";
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_ASCENT"] = 2] = "STRATIFICATION_ASCENT";
})(SatParameters_MaxSatStratificationAlgorithm || (SatParameters_MaxSatStratificationAlgorithm = {}));
var SatParameters_SearchBranching;
(function(SatParameters_SearchBranching2) {
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["AUTOMATIC_SEARCH"] = 0] = "AUTOMATIC_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["FIXED_SEARCH"] = 1] = "FIXED_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PORTFOLIO_SEARCH"] = 2] = "PORTFOLIO_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["LP_SEARCH"] = 3] = "LP_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PSEUDO_COST_SEARCH"] = 4] = "PSEUDO_COST_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PORTFOLIO_WITH_QUICK_RESTART_SEARCH"] = 5] = "PORTFOLIO_WITH_QUICK_RESTART_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["HINT_SEARCH"] = 6] = "HINT_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PARTIAL_FIXED_SEARCH"] = 7] = "PARTIAL_FIXED_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["RANDOMIZED_SEARCH"] = 8] = "RANDOMIZED_SEARCH";
})(SatParameters_SearchBranching || (SatParameters_SearchBranching = {}));
var SatParameters_SharedTreeSplitStrategy;
(function(SatParameters_SharedTreeSplitStrategy2) {
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_AUTO"] = 0] = "SPLIT_STRATEGY_AUTO";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_DISCREPANCY"] = 1] = "SPLIT_STRATEGY_DISCREPANCY";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_OBJECTIVE_LB"] = 2] = "SPLIT_STRATEGY_OBJECTIVE_LB";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_BALANCED_TREE"] = 3] = "SPLIT_STRATEGY_BALANCED_TREE";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_FIRST_PROPOSAL"] = 4] = "SPLIT_STRATEGY_FIRST_PROPOSAL";
})(SatParameters_SharedTreeSplitStrategy || (SatParameters_SharedTreeSplitStrategy = {}));
var SatParameters_FPRoundingMethod;
(function(SatParameters_FPRoundingMethod2) {
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["NEAREST_INTEGER"] = 0] = "NEAREST_INTEGER";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["LOCK_BASED"] = 1] = "LOCK_BASED";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["ACTIVE_LOCK_BASED"] = 3] = "ACTIVE_LOCK_BASED";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["PROPAGATION_ASSISTED"] = 2] = "PROPAGATION_ASSISTED";
})(SatParameters_FPRoundingMethod || (SatParameters_FPRoundingMethod = {}));

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/solver/cp-solver.js
var glueLoader;
var glueIsThreaded = false;
function setGlueLoader(loader, threaded) {
  glueLoader = loader;
  glueIsThreaded = threaded;
}
function readResponse(response) {
  return {
    status: response.status,
    objectiveValue: response.objectiveValue,
    bestObjectiveBound: response.bestObjectiveBound,
    wallTime: response.wallTime,
    value(variable) {
      return Number(response.solution[variable.index]);
    },
    response
  };
}
var CpSolver = class _CpSolver {
  module;
  constructor(module) {
    this.module = module;
  }
  static async create(options) {
    if (!glueLoader) {
      throw new Error("No WASM build was registered. Import the package entry point ('cpsat-js', 'cpsat-js/threaded' or 'cpsat-js/portable') rather than a deep internal path.");
    }
    const createModule = await glueLoader(options?.locateFile);
    const module = await createModule();
    return new _CpSolver(module);
  }
  solve(model, params) {
    const modelProto = model.toProto();
    const modelBytes = toBinary(CpModelProtoSchema, modelProto);
    const satParams = create(SatParametersSchema, {});
    satParams.numWorkers = 8;
    if (params?.maxTimeInSeconds !== void 0) {
      satParams.maxTimeInSeconds = params.maxTimeInSeconds;
    }
    if (params?.numWorkers !== void 0) {
      satParams.numWorkers = params.numWorkers;
    }
    if (params?.enumerateAllSolutions !== void 0) {
      satParams.enumerateAllSolutions = params.enumerateAllSolutions;
    }
    if (!glueIsThreaded) {
      satParams.numWorkers = 1;
    }
    const paramsBytes = toBinary(SatParametersSchema, satParams);
    const modelPtr = this.module._malloc(modelBytes.length);
    this.module.HEAPU8.set(modelBytes, modelPtr);
    const paramsPtr = this.module._malloc(paramsBytes.length);
    this.module.HEAPU8.set(paramsBytes, paramsPtr);
    const onSolution = params?.onSolution;
    if (onSolution) {
      this.module.__cpsatOnSolution = (bytes) => {
        onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: true });
      };
    }
    let resultLen;
    try {
      resultLen = this.module._solve(modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, onSolution ? 1 : 0);
    } finally {
      this.module._free(modelPtr);
      this.module._free(paramsPtr);
      delete this.module.__cpsatOnSolution;
    }
    if (onSolution) {
      const recorded = this.module._solution_count();
      for (let i = 0; i < recorded; i++) {
        const ptr = this.module._solution_ptr(i);
        const len = this.module._solution_len(i);
        const bytes = this.module.HEAPU8.slice(ptr, ptr + len);
        onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: false });
      }
    }
    const resultPtr = this.module._get_result_ptr();
    const resultBytes = new Uint8Array(this.module.HEAPU8.buffer, resultPtr, resultLen);
    const resultCopy = new Uint8Array(resultBytes);
    this.module._free_result();
    const response = fromBinary(CpSolverResponseSchema, resultCopy);
    return {
      status: response.status,
      objectiveValue: response.objectiveValue,
      bestObjectiveBound: response.bestObjectiveBound,
      wallTime: response.wallTime,
      value(variable) {
        return Number(response.solution[variable.index]);
      },
      response
    };
  }
};
function makeGlueLoader(importGlue, wasmUrl) {
  return async (locateFile) => {
    const glue = await importGlue();
    const factory = glue.default;
    if (typeof factory !== "function") {
      throw new Error("cpsat glue did not export a factory function");
    }
    const url = wasmUrl();
    const resolvedLocate = locateFile ?? ((path) => path.endsWith(".wasm") ? url : path);
    return (options) => factory({ ...options, locateFile: resolvedLocate });
  };
}

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/linear-expr.js
var LinearExpr = class _LinearExpr {
  /** Map from variable index to coefficient */
  terms;
  offset;
  constructor(terms, offset) {
    this.terms = terms;
    this.offset = offset;
  }
  static fromConstant(value) {
    return new _LinearExpr(/* @__PURE__ */ new Map(), BigInt(value));
  }
  static fromVarIndex(varIndex, coeff = 1n) {
    return new _LinearExpr(/* @__PURE__ */ new Map([[varIndex, coeff]]), 0n);
  }
  plus(other) {
    if (typeof other === "number" || typeof other === "bigint") {
      return new _LinearExpr(new Map(this.terms), this.offset + BigInt(other));
    }
    const newTerms = new Map(this.terms);
    for (const [varIdx, coeff] of other.terms) {
      const existing = newTerms.get(varIdx) ?? 0n;
      const sum = existing + coeff;
      if (sum === 0n) {
        newTerms.delete(varIdx);
      } else {
        newTerms.set(varIdx, sum);
      }
    }
    return new _LinearExpr(newTerms, this.offset + other.offset);
  }
  minus(other) {
    if (typeof other === "number" || typeof other === "bigint") {
      return new _LinearExpr(new Map(this.terms), this.offset - BigInt(other));
    }
    return this.plus(other.times(-1));
  }
  times(scalar) {
    const s = BigInt(scalar);
    if (s === 0n) {
      return _LinearExpr.fromConstant(0);
    }
    const newTerms = /* @__PURE__ */ new Map();
    for (const [varIdx, coeff] of this.terms) {
      newTerms.set(varIdx, coeff * s);
    }
    return new _LinearExpr(newTerms, this.offset * s);
  }
  negate() {
    return this.times(-1);
  }
  /** expr == value */
  equals(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 0n);
  }
  /** expr <= value */
  le(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, -4503599627370496n, 0n);
  }
  /** expr >= value */
  ge(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 4503599627370496n);
  }
  /** expr < value */
  lt(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, -4503599627370496n, -1n);
  }
  /** expr > value */
  gt(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 1n, 4503599627370496n);
  }
  toProto() {
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of this.terms) {
      vars.push(varIdx);
      coeffs.push(coeff);
    }
    return create(LinearExpressionProtoSchema, {
      vars,
      coeffs,
      offset: this.offset
    });
  }
};
var BoundedLinearExpression = class {
  expr;
  lb;
  ub;
  constructor(expr, lb, ub) {
    this.expr = expr;
    this.lb = lb;
    this.ub = ub;
  }
};
function toLinearExpr(value) {
  if (value instanceof LinearExpr)
    return value;
  if (typeof value === "number" || typeof value === "bigint")
    return LinearExpr.fromConstant(value);
  return value.toLinearExpr();
}

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/int-var.js
var INT_VAR_MIN = -(2 ** 52);
var INT_VAR_MAX = 2 ** 52;
var IntVar = class {
  index;
  name;
  constructor(index, name) {
    this.index = index;
    this.name = name;
  }
  toLinearExpr() {
    return LinearExpr.fromVarIndex(this.index);
  }
  plus(other) {
    return this.toLinearExpr().plus(toLinearExpr(other));
  }
  minus(other) {
    return this.toLinearExpr().minus(toLinearExpr(other));
  }
  times(scalar) {
    return this.toLinearExpr().times(scalar);
  }
  negate() {
    return this.toLinearExpr().negate();
  }
  /** expr == other */
  equals(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 0n);
  }
  /** expr != other — encoded as domain with hole at 0 */
  notEquals(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), BigInt(INT_VAR_MAX));
  }
  /** expr <= other */
  le(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), 0n);
  }
  /** expr >= other */
  ge(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, BigInt(INT_VAR_MAX));
  }
  /** expr < other */
  lt(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), -1n);
  }
  /** expr > other */
  gt(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 1n, BigInt(INT_VAR_MAX));
  }
  /** Negative literal: NOT this variable (for boolean context) */
  not() {
    return -this.index - 1;
  }
};
var BoolVar = class extends IntVar {
  constructor(index, name) {
    super(index, name);
  }
};

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/interval-var.js
var IntervalVar = class {
  /** Index of the interval constraint in the model's constraints array */
  constraintIndex;
  name;
  constructor(constraintIndex, name) {
    this.constraintIndex = constraintIndex;
    this.name = name;
  }
};

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/constraint.js
var Constraint = class {
  proto;
  constructor(proto) {
    this.proto = proto;
  }
  /**
   * Sets enforcement literals. The constraint is only enforced when
   * all given literals are true.
   */
  onlyEnforceIf(literals) {
    const arr = Array.isArray(literals) ? literals : [literals];
    this.proto.enforcementLiteral = arr.map((lit) => typeof lit === "number" ? lit : lit.index);
    return this;
  }
};

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/cp-model.js
var CpModel = class {
  proto;
  /**
   * Hinted values, keyed by variable index.
   *
   * A Map rather than the proto's two parallel arrays because CpModelProto requires
   * the hinted indices to be unique. Keyed this way, hinting one variable twice
   * cannot be expressed, so it cannot produce an invalid model.
   */
  hints = /* @__PURE__ */ new Map();
  constructor(name) {
    this.proto = create(CpModelProtoSchema, { name: name ?? "" });
  }
  // ── Variable creation ──
  newIntVar(lb, ub, name) {
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [BigInt(lb), BigInt(ub)]
    }));
    return new IntVar(index, name);
  }
  newBoolVar(name) {
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [0n, 1n]
    }));
    return new BoolVar(index, name);
  }
  newConstant(value) {
    const v = BigInt(value);
    const name = `const_${v}`;
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [v, v]
    }));
    return new IntVar(index, name);
  }
  // ── Interval creation ──
  newIntervalVar(start, size, end, name) {
    const ct = this.addConstraintProto();
    ct.name = name;
    ct.constraint = {
      case: "interval",
      value: create(IntervalConstraintProtoSchema, {
        start: toLinearExpr(start).toProto(),
        size: toLinearExpr(size).toProto(),
        end: toLinearExpr(end).toProto()
      })
    };
    return new IntervalVar(this.proto.constraints.length - 1, name);
  }
  // ── Constraints ──
  /** Add a bounded linear constraint: lb <= expr <= ub */
  add(bounded) {
    const ct = this.addConstraintProto();
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of bounded.expr.terms) {
      vars.push(varIdx);
      coeffs.push(coeff);
    }
    ct.constraint = {
      case: "linear",
      value: create(LinearConstraintProtoSchema, {
        vars,
        coeffs,
        domain: [bounded.lb - bounded.expr.offset, bounded.ub - bounded.expr.offset]
      })
    };
    return new Constraint(ct);
  }
  addLinearConstraint(expr, lb, ub) {
    const linearExpr = toLinearExpr(expr);
    return this.add(new BoundedLinearExpression(linearExpr, BigInt(lb), BigInt(ub)));
  }
  addAllDifferent(exprs) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "allDiff",
      value: create(AllDifferentConstraintProtoSchema, {
        exprs: exprs.map((e) => toLinearExpr(e).toProto())
      })
    };
    return new Constraint(ct);
  }
  addBoolOr(literals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "boolOr",
      value: create(BoolArgumentProtoSchema, {
        literals: literals.map((lit) => typeof lit === "number" ? lit : lit.index)
      })
    };
    return new Constraint(ct);
  }
  addBoolAnd(literals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "boolAnd",
      value: create(BoolArgumentProtoSchema, {
        literals: literals.map((lit) => typeof lit === "number" ? lit : lit.index)
      })
    };
    return new Constraint(ct);
  }
  addNoOverlap(intervals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "noOverlap",
      value: create(NoOverlapConstraintProtoSchema, {
        intervals: intervals.map((iv) => iv.constraintIndex)
      })
    };
    return new Constraint(ct);
  }
  addCircuit(arcs) {
    const tails = [];
    const heads = [];
    const literals = [];
    for (const [tail, head, lit] of arcs) {
      tails.push(tail);
      heads.push(head);
      literals.push(typeof lit === "number" ? lit : lit.index);
    }
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "circuit",
      value: create(CircuitConstraintProtoSchema, { tails, heads, literals })
    };
    return new Constraint(ct);
  }
  // ── Objective ──
  minimize(expr) {
    this.setObjective(expr, false);
  }
  maximize(expr) {
    this.setObjective(expr, true);
  }
  // ── Hints ──
  /**
   * Suggest a value for a variable, tried before the search proper begins.
   *
   * A hint is advisory. It does not constrain anything: a wrong one costs search
   * time and nothing else, and cannot change the optimal value. So this is a way
   * to say "start from here", not a way to fix a variable — use `add(v.equals(n))`
   * for that.
   *
   * Hints may be partial, and usually should be. Naming the few variables that
   * decide a solution lets propagation derive the rest, which is both less work to
   * build and less to get wrong than spelling out every variable.
   */
  addHint(variable, value) {
    this.hints.set(variable.index, BigInt(value));
  }
  /** Forget every hint added so far. */
  clearHints() {
    this.hints.clear();
  }
  // ── Serialization ──
  toProto() {
    this.proto.solutionHint = this.hints.size ? create(PartialVariableAssignmentSchema, {
      vars: [...this.hints.keys()],
      values: [...this.hints.values()]
    }) : void 0;
    return this.proto;
  }
  // ── Internal ──
  addConstraintProto() {
    const ct = create(ConstraintProtoSchema, {});
    this.proto.constraints.push(ct);
    return ct;
  }
  setObjective(expr, maximize) {
    const linearExpr = toLinearExpr(expr);
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of linearExpr.terms) {
      vars.push(varIdx);
      coeffs.push(maximize ? -coeff : coeff);
    }
    this.proto.objective = create(CpObjectiveProtoSchema, {
      vars,
      coeffs,
      offset: maximize ? -Number(linearExpr.offset) : Number(linearExpr.offset),
      scalingFactor: maximize ? -1 : 1
    });
  }
};

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/model/domain.js
var Domain = class _Domain {
  intervals;
  constructor(intervals) {
    this.intervals = intervals;
  }
  static fromRange(min, max) {
    return new _Domain([[BigInt(min), BigInt(max)]]);
  }
  static fromValues(values) {
    if (values.length === 0) {
      return new _Domain([]);
    }
    const sorted = [...values].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const intervals = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1n) {
        end = sorted[i];
      } else {
        intervals.push([start, end]);
        start = sorted[i];
        end = sorted[i];
      }
    }
    intervals.push([start, end]);
    return new _Domain(intervals);
  }
  static fromFlattenedIntervals(flat) {
    const intervals = [];
    for (let i = 0; i < flat.length; i += 2) {
      intervals.push([flat[i], flat[i + 1]]);
    }
    return new _Domain(intervals);
  }
  toFlatBigIntArray() {
    return this.intervals.flatMap(([min, max]) => [min, max]);
  }
};

// .sites-runtime/cpsat-js/node_modules/cpsat-js/dist/index.portable.js
setGlueLoader(makeGlueLoader(
  // @ts-expect-error Emscripten-generated ESM glue; no TS declarations.
  () => import("../build/portable/cpsat.mjs"),
  () => new URL("../build/portable/cpsat.wasm", import.meta.url).href
), false);
export {
  BoolVar,
  BoundedLinearExpression,
  Constraint,
  CpModel,
  CpSolver,
  CpSolverStatus,
  Domain,
  IntVar,
  IntervalVar,
  LinearExpr
};
