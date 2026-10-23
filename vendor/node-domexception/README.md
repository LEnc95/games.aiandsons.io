# Native DOMException compatibility export

The server and CI target Node 22, which provides the standard global
DOMException constructor. fetch-blob 3 still imports the deprecated
node-domexception shim; this local, dependency-free package exports that exact
native constructor using the same CommonJS/default-import shape.

The local dependency satisfies fetch-blob 3's existing version range. Remove it
and this directory when the upstream dependency no longer imports node-domexception. Keep the SDK transport
and file-backed Blob error regression tests when changing this compatibility package.
