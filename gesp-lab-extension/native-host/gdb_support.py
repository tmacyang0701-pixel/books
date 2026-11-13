"""Fixed inspector executed inside GDB's embedded Python (no user expressions)."""
SOURCE = r'''
import gdb, json, itertools, os
CA_VALUES = {}
CA_MAIN = os.path.normcase(os.path.abspath('main.cpp'))

def ca_text(value, limit=1500):
    try: return str(value)[:limit]
    except Exception as exc: return '<unavailable: ' + str(exc)[:150] + '>'

def ca_row(ident, name, value, group='member'):
    CA_VALUES[ident] = value
    try: address = hex(int(value.address)) if value.address is not None else ''
    except Exception: address = ''
    try:
        kind = value.type.strip_typedefs().code
        printer = gdb.default_visualizer(value)
        expandable = bool(printer and hasattr(printer, 'children')) or kind in (gdb.TYPE_CODE_ARRAY,gdb.TYPE_CODE_STRUCT,gdb.TYPE_CODE_UNION,gdb.TYPE_CODE_PTR,gdb.TYPE_CODE_REF)
    except Exception: expandable = False
    return dict(id=ident,name=name,group=group,type=ca_text(value.type,200),value=ca_text(value),address=address,expandable=expandable)

def ca_snapshot(level=0, offset=0):
    global CA_VALUES
    CA_VALUES={}
    frames=[]; frame=gdb.newest_frame(); selected=None; index=0
    while frame is not None and index<40:
        sal=frame.find_sal();filename=sal.symtab.fullname() if sal.symtab else ''
        try: function=frame.name() or '?'
        except Exception: function='?'
        frames.append(dict(level=index,function=function,file=os.path.basename(filename),line=sal.line,isUser=os.path.normcase(filename)==CA_MAIN))
        if index==level:selected=frame
        frame=frame.older();index+=1
    if selected is None: raise ValueError('Stack frame is no longer available')
    selected.select(); sal=selected.find_sal();symbols=[];seen=set()
    # Runtime/library frames can lack a lexical block. Keep stepping available
    # and show an empty variable list instead of terminating the session.
    try: block=selected.block()
    except Exception: block=None
    while block is not None:
        for symbol in block:
            if not (symbol.is_argument or symbol.is_variable):continue
            name=symbol.print_name
            if name in seen:continue
            if (block.is_global or block.is_static) and (not symbol.symtab or os.path.normcase(symbol.symtab.fullname())!=CA_MAIN):continue
            seen.add(name);group='argument' if symbol.is_argument else ('global' if block.is_global or block.is_static else 'local')
            symbols.append((symbol,group))
        block=block.superblock
    rows=[]
    for i,(symbol,group) in enumerate(symbols[offset:offset+80],offset):
        try:
            if group=='local' and symbol.line>sal.line:raise ValueError('declaration not reached')
            rows.append(ca_row('v'+str(i),symbol.print_name,symbol.value(selected),group))
        except Exception as exc:
            rows.append(dict(id='v'+str(i),name=symbol.print_name,group=group,type=ca_text(symbol.type,200),value='<unavailable: '+str(exc)[:150]+'>',address='',expandable=False))
    return dict(frames=frames,frame=frames[level],variables=rows,offset=offset,total=len(symbols),more=offset+80<len(symbols))

def ca_children(ident, offset=0):
    value=CA_VALUES[ident];kind=value.type.strip_typedefs().code;printer=gdb.default_visualizer(value)
    if printer and hasattr(printer,'children'):
        children=itertools.islice(printer.children(),offset,offset+81)
    elif kind==gdb.TYPE_CODE_ARRAY:
        low,high=value.type.strip_typedefs().range()
        children=(('['+str(i)+']',value[i]) for i in range(low+offset,min(high+1,low+offset+81)))
    elif kind in (gdb.TYPE_CODE_STRUCT,gdb.TYPE_CODE_UNION):
        fields=[f for f in value.type.strip_typedefs().fields() if f.name]
        children=((f.name,value[f]) for f in fields[offset:offset+81])
    elif kind in (gdb.TYPE_CODE_PTR,gdb.TYPE_CODE_REF):
        children=[] if offset else [('*',value.dereference())]
    else:children=[]
    rows=[];more=False
    for i,(name,child) in enumerate(children,offset):
        if i>=offset+80:more=True;break
        rows.append(ca_row(ident+'.'+str(i),str(name),child))
    return dict(id=ident,variables=rows,offset=offset,more=more)

def ca_memory(ident):
    value=CA_VALUES[ident]
    if value.address is None:raise ValueError('This value has no readable memory address')
    address=int(value.address);size=min(int(value.type.sizeof),64)
    data=bytes(gdb.selected_inferior().read_memory(address,size))
    return dict(id=ident,address=hex(address),size=int(value.type.sizeof),bytes=' '.join('%02x'%byte for byte in data),truncated=int(value.type.sizeof)>64)

def ca_emit(function,*args):
    try: result=function(*args)
    except Exception as exc: result={'error':str(exc)[:400]}
    gdb.write('CODEARENA_JSON:'+json.dumps(result,ensure_ascii=True)+'\n')
'''
