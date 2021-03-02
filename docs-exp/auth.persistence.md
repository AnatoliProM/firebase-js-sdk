<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@firebase/auth](./auth.md) &gt; [Persistence](./auth.persistence.md)

## Persistence interface

An interface covering the possible persistence mechanism types.

<b>Signature:</b>

```typescript
export interface Persistence 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [type](./auth.persistence.type.md) | 'SESSION' \| 'LOCAL' \| 'NONE' | Type of Persistence. - 'SESSION' is used for temporary persistence such as <code>sessionStorage</code>. - 'LOCAL' is used for long term persistence such as <code>localStorage</code> or <code>IndexedDB</code>. - 'NONE' is used for in-memory, or no persistence. |
